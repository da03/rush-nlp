"""Golden-snapshot harness: pin the helper's exact behavior, then prove a refactor
changes nothing.

The framework extraction (rush-nlp/helper -> paw-helper + content pack) is a
REFACTOR: the compiled programs and content do not change, so at temperature 0
every response must be byte-identical. We exploit that as a hard gate.

    python helper/snapshot.py            # write helper/bench/golden.jsonl (the baseline)
    python helper/snapshot.py --check    # re-run, diff vs golden.jsonl; exit 1 on ANY diff

A nonempty --check diff means the refactor changed behavior - fix it until clean.

The query set is the union of every bench/*.yaml query (run at its natural page)
plus a curated cross-page ad-hoc list that locks the page-aware routing (the SAME
question answered per page). Deterministic order so diffs are readable.
"""

import argparse
import datetime
import json
import pathlib
import sys

import yaml

from paw_helper import common, pipeline

common.set_content_dir(pathlib.Path(__file__).resolve().parent)

# Pin the injected "today" so the golden is date-STABLE: course facts inject the
# current date, which otherwise shifts a couple of course answers day-to-day and
# would make this regression gate (meant to catch CODE changes) drift on its own.
import course_facts  # noqa: E402  (content module; on the pack's path)

_PINNED_TODAY = datetime.date(2026, 6, 20)
course_facts._today = lambda: _PINNED_TODAY

BENCH = common.CONTENT_DIR / "bench"
GOLDEN = BENCH / "golden.jsonl"

# Which page each bench file's queries are exercised at (domain.yaml carries its
# own per-case page and is handled specially).
FILE_PAGE = {
    "pages.yaml": "site",
    "questions.yaml": "site",
    "site_topics.yaml": "site",
    "site_people.yaml": "site",
    "course_pages.yaml": "course:cs486_s26",
    "course_questions.yaml": "course:cs486_s26",
    "slides.yaml": "course:cs486_s26",
    "neuralos_pages.yaml": "site:neuralos",
    "neuralos_questions.yaml": "site:neuralos",
}

# Cross-page ad-hoc set: the SAME query at every page, to lock page-aware routing,
# plus adversarial / each-render-type probes. (query, page) pairs.
AD_HOC_QUERIES = [
    "who are the authors", "who made this", "is there a paper", "where is the code",
    "how was it trained", "what is this", "how does it work", "are you taking students",
    "what is neuralos", "what is programasweights", "how do I contact you",
    "where is your cv", "tell me about your research", "what are you working on",
]
AD_HOC_PAGES = ["site", "site:neuralos", "course:cs486_s26"]

# Extra single-page adversarial probes (render-type coverage + declines).
EXTRA = [
    ("where is your cv", "site"), ("email yuntian", "site"), ("are you on twitter", "site"),
    ("what's your salary", "site"), ("meow", "site"), ("how was this helper built", "site"),
    ("when is the next assignment due", "course:cs486_s26"),
    ("slides for the search lecture", "course:cs486_s26"),
    ("chrysalis is down", "course:cs486_s26"), ("who are the TAs", "course:cs486_s26"),
    ("the demo is frozen", "site:neuralos"), ("can it play doom", "site:neuralos"),
    ("how do I use this", "site:neuralos"), ("how many gpus does it need", "site:neuralos"),
]


def _load(name):
    return yaml.safe_load((BENCH / name).read_text(encoding="utf-8")) or []


def collect_pairs() -> list[tuple[str, str]]:
    """Deterministic, de-duplicated list of (query, page) pairs to snapshot."""
    pairs: set[tuple[str, str]] = set()
    for case in _load("domain.yaml"):
        if "query" in case:
            pairs.add((case["query"], case.get("page", "site")))
    for fname, page in FILE_PAGE.items():
        for case in _load(fname):
            q = case.get("query")
            if q:
                pairs.add((q, page))
    for case in _load("real_queries.yaml"):
        q = case.get("query")
        if q:
            pairs.add((q, case.get("page", "site")))
    for q in AD_HOC_QUERIES:
        for page in AD_HOC_PAGES:
            pairs.add((q, page))
    for q, page in EXTRA:
        pairs.add((q, page))
    return sorted(pairs)


def _normalize(meta: dict) -> dict:
    """Stable, comparable view of a pipeline result (full answer text retained)."""
    r = meta.get("result", {})
    items = r.get("items")
    return {
        "domain": meta.get("domain"),
        "route": meta.get("route"),
        "verdict": meta.get("verdict"),
        "type": r.get("type"),
        "label": r.get("label"),
        "url": r.get("url"),
        "text": r.get("text"),
        "items": [{"label": it.get("label"), "url": it.get("url")} for it in items] if items else None,
    }


def build(pipe: pipeline.Pipeline) -> list[dict]:
    rows = []
    for q, page in collect_pairs():
        meta = pipe.run(q, page=page)
        rows.append({"query": q, "page": page, **_normalize(meta)})
    return rows


def dumps(rows: list[dict]) -> str:
    return "\n".join(json.dumps(r, ensure_ascii=False, sort_keys=True) for r in rows) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="Diff vs golden.jsonl; exit 1 on any diff.")
    args = ap.parse_args()

    pipe = pipeline.Pipeline()
    rows = build(pipe)

    if not args.check:
        GOLDEN.write_text(dumps(rows), encoding="utf-8")
        print(f"Wrote {GOLDEN} ({len(rows)} rows, domains={pipe.available})")
        return

    if not GOLDEN.exists():
        sys.exit("No golden.jsonl - run `python helper/snapshot.py` first.")
    old = {(r["query"], r["page"]): r for r in
           (json.loads(l) for l in GOLDEN.read_text(encoding="utf-8").splitlines() if l.strip())}
    new = {(r["query"], r["page"]): r for r in rows}
    diffs = 0
    for key in sorted(set(old) | set(new)):
        o, n = old.get(key), new.get(key)
        if o != n:
            diffs += 1
            print(f"\nDIFF {key!r}")
            for f in ("domain", "route", "type", "label", "url", "text", "items", "verdict"):
                if (o or {}).get(f) != (n or {}).get(f):
                    print(f"  {f}: {(o or {}).get(f)!r}\n     -> {(n or {}).get(f)!r}")
    if diffs:
        sys.exit(f"\nGOLDEN MISMATCH: {diffs}/{len(new)} rows changed (behavior is NOT preserved).")
    print(f"OK: golden snapshot matches ({len(new)} rows) - behavior preserved.")


if __name__ == "__main__":
    main()
