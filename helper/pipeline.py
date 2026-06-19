"""Generic, config-driven PAW pipeline executor (shared by server + eval).

Reads pipeline.yaml (the graph) and programs.json (compiled IDs) and runs:

    domain_router (page prior + PAW) -> <domain>.classifier
        -> link label  -> link / feedback result
        -> "question"  -> <domain>.answerer -> validator -> answer / fallback

Course answers inject facts at inference time via course_facts.retrieve (the same
seam a future Piazza RAG retriever plugs into). Resilience knobs (backtrack /
reconsider / multi) live in pipeline.yaml so the eval ablation runner picks them.

Keeping one executor for both the server and the benchmark means they can never
score differently from what ships.
"""

import threading
import time

import yaml

import common
import course_facts

PIPELINE_PATH = common.HELPER_DIR / "pipeline.yaml"


def load_config(path=None) -> dict:
    with open(path or PIPELINE_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_links(filename: str) -> dict:
    """label -> info dict, for either links.yaml or course_links.yaml."""
    with open(common.HELPER_DIR / filename, encoding="utf-8") as f:
        return yaml.safe_load(f)


def normalize_label(raw: str, valid: set[str]) -> str:
    """First token of the model output, mapped to a known label or 'question'.

    Unknown/malformed output -> 'question' (safer than a wrong link). Shared by
    every domain so the server and benchmark score identically.
    """
    s = raw.strip().lower().strip("\"'").strip(".")
    parts = s.split()
    s = parts[0] if parts else ""
    return s if (s in valid or s == "question") else "question"


# Runtime-injected fact providers (name -> fn(query) -> facts str). The RAG seam.
CONTEXT_PROVIDERS = {
    "course": course_facts.retrieve,
    "paw": lambda q: common.load_topic_facts("paw"),
    "neuralos": lambda q: common.load_topic_facts("neuralos"),
}
# Header label each provider's facts are injected under (must match the spec).
CONTEXT_LABELS = {"course": "Course facts", "paw": "Facts", "neuralos": "Facts"}


def _is_decline(answer: str) -> bool:
    a = answer.lower()
    return (not answer.strip() or "don't have that" in a or "do not have that" in a
            or "i'm not sure" in a or "i don't know" in a)

# Resource-router providers: (render candidate list, map selected ids -> link items).
# The rule side (candidate list + id->URL) is deterministic; the fuzzy side is the
# selector PAW program. This is the generic hook for slides today, papers/demos later.
RESOURCE_PROVIDERS = {
    "course_lectures": (course_facts.render_lectures, course_facts.slides_for),
}


class Pipeline:
    def __init__(self, programs: dict | None = None, config: dict | None = None):
        self.cfg = config or load_config()
        self.programs = programs if programs is not None else common.load_programs()["programs"]
        self.mt = self.cfg["max_tokens"]
        self.resilience = self.cfg.get("resilience", {})
        self.links = {d: _load_links(spec["links"]) for d, spec in self.cfg["domains"].items()}
        # (domain, classifier label) -> resource-router config (e.g. course/slides).
        self.resource_routers = {(rr["domain"], rr["label"]): rr for rr in self.cfg.get("resource_routers", [])}
        # A domain is usable only if its classifier + answerer are compiled.
        self.available = [
            d for d, spec in self.cfg["domains"].items()
            if spec["classifier"] in self.programs and spec["answerer"] in self.programs
        ]
        self._fns: dict[str, object] = {}
        self._lock = threading.Lock()
        self.timings: list[tuple[str, float]] = []  # (node, seconds); eval reads/clears

    # --- inference ---------------------------------------------------------
    def _fn(self, name: str):
        import programasweights as paw
        if name not in self._fns:
            self._fns[name] = paw.function(self.programs[name])
        return self._fns[name]

    def _infer(self, name: str, text: str, max_tokens: int) -> str:
        """Serialized, error-swallowing inference. Returns "" on any failure."""
        t = time.time()
        try:
            with self._lock:
                out = self._fn(name)(text[:4000], max_tokens=max_tokens, temperature=0.0).strip()
        except Exception:
            out = ""
        self.timings.append((name, time.time() - t))
        return out

    # --- routing -----------------------------------------------------------
    def resolve_domain(self, query: str, page: str) -> str:
        default = self.cfg["page_defaults"].get(page, self.cfg["default_domain"])
        if default not in self.available:
            default = self.cfg["default_domain"] if self.cfg["default_domain"] in self.available else (
                self.available[0] if self.available else self.cfg["default_domain"])
        router = self.cfg.get("domain_router")
        if router and router in self.programs and len(self.available) > 1:
            r = normalize_label(self._infer(router, query, self.mt["router"]), set(self.available))
            # 'either'/unknown -> page default; a confident domain overrides it.
            if r in self.available:
                return r
        return default

    # --- node-level helpers (reused by the executor and the benchmark) -----
    def classify(self, domain: str, query: str) -> str:
        """Run a domain's classifier; returns a link label or 'question'."""
        spec = self.cfg["domains"][domain]
        raw = self._infer(spec["classifier"], query, self.mt["classifier"])
        return normalize_label(raw, set(self.links[domain]))

    def _inject(self, provider: str, query: str) -> str:
        """Build a facts-injected answerer input under the provider's header label."""
        ctx = CONTEXT_PROVIDERS[provider](query)
        return f"{CONTEXT_LABELS.get(provider, 'Facts')}:\n{ctx}\n\nQuestion: {query}"

    def _answer_input(self, spec: dict, query: str) -> str:
        """Flat-domain answerer input: bare query (baked) or facts+question (runtime)."""
        if spec.get("facts_mode") == "runtime":
            return self._inject(spec["context"], query)
        return query

    def freeform(self, domain: str, query: str) -> tuple[str, str]:
        """Run a domain's answerer + validator; returns (answer, verdict).

        If the domain has a topic_router, route to a specialized sub-answerer with
        detailed injected facts (single-best). If the sub-answerer declines or is
        empty, BACKTRACK to the flat answerer (redundancy). The validator gates.
        """
        spec = self.cfg["domains"][domain]
        flat = spec["answerer"]
        answerer_name, sub_provider = flat, None

        tr = spec.get("topic_router")
        if tr and tr in self.programs:
            raw = self._infer(tr, query, self.mt["router"]).strip().lower().split()
            topic = raw[0] if raw else ""
            sub = spec.get("topics", {}).get(topic)
            if isinstance(sub, dict) and sub.get("answerer") in self.programs:
                answerer_name, sub_provider = sub["answerer"], sub.get("context")

        inp = self._inject(sub_provider, query) if sub_provider else self._answer_input(spec, query)
        answer = self._infer(answerer_name, inp, self.mt["answerer"])

        # Backtrack to the flat answerer only if the sub-answerer produced nothing.
        # We deliberately do NOT backtrack on a decline: the sub-answerer has the
        # detailed facts, so its honest "I don't have that detail" is better than
        # the flat answerer's tendency to hallucinate on out-of-facts questions.
        if answerer_name != flat and len(answer) < 2:
            answer = self._infer(flat, self._answer_input(spec, query), self.mt["answerer"])

        verdict = ""
        if len(answer) >= 2:
            verdict = self._infer(self.cfg["validator"], f"Q: {query} A: {answer}", self.mt["validator"]).lower()
        return answer, verdict

    def resource_items(self, rr: dict, query: str) -> list[dict]:
        """Rule+fuzzy resource lookup: inject candidate list, select ids, map to items."""
        render, mapper = RESOURCE_PROVIDERS[rr["provider"]]
        candidates = render()
        raw = self._infer(rr["program"], f"{rr.get('candidate_label', 'Items')}:\n{candidates}\n\nRequest: {query}",
                          self.mt.get("selector", 16))
        ids = course_facts.parse_lecture_nums(raw)
        return mapper(ids)[: rr.get("max_items", 4)]

    # --- per-domain classify -> resource | link | answer -> validate -------
    def _run_domain(self, domain: str, query: str) -> dict:
        links = self.links[domain]
        label = self.classify(domain, query)

        # Hierarchical resource router (e.g. course/slides -> specific decks).
        rr = self.resource_routers.get((domain, label))
        if rr and rr["program"] in self.programs:
            items = self.resource_items(rr, query)
            if items:
                res = {"type": "links", "label": rr.get("result_label", "Links"),
                       "items": [{"label": f"L{it['num']}: {it['topic']}", "url": it["url"],
                                  "description": rr.get("item_description", "")} for it in items]}
                return {"result": res, "domain": domain, "route": label, "verdict": None}
            # No match -> fall through to the plain link (fallback, e.g. the schedule).

        if label != "question" and label in links:
            info = links[label]
            if info.get("kind") == "feedback":
                res = {"type": "feedback", "label": info["label"], "description": info.get("description", "")}
            else:
                res = {"type": "link", "label": info["label"], "url": info["url"],
                       "description": info.get("description", "")}
            return {"result": res, "domain": domain, "route": label, "verdict": None}

        # Freeform answer path.
        answer, verdict = self.freeform(domain, query)
        if len(answer) < 2:
            res = {"type": "none"}
        elif not self.resilience.get("backtrack", True):
            res = {"type": "answer", "text": answer}
        else:
            res = {"type": "answer", "text": answer} if verdict.startswith("yes") else {"type": "none"}
        return {"result": res, "domain": domain, "route": "question", "verdict": verdict or None}

    # --- public API --------------------------------------------------------
    def run(self, query: str, page: str = "site") -> dict:
        """Full result with meta: {result, domain, route, verdict}."""
        q = (query or "").strip()
        if len(q) < 3:
            return {"result": {"type": "none"}, "domain": None, "route": None, "verdict": None}
        domain = self.resolve_domain(q, page)
        out = self._run_domain(domain, q)
        # Reconsider: if the routed domain declined, try the page-default domain once.
        if out["result"].get("type") == "none" and self.resilience.get("reconsider"):
            default = self.cfg["page_defaults"].get(page, self.cfg["default_domain"])
            if default in self.available and default != domain:
                alt = self._run_domain(default, q)
                if alt["result"].get("type") != "none":
                    alt["reconsidered_from"] = domain
                    out = alt
        return out
