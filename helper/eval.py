"""Benchmark the helper pipeline (all domains + real queries), via the shared executor.

Routing suites are auto-graded; open-ended cases are graded per-point by the
validated rubric_checker (helper/grader.py) - it prints a scorecard (points hit /
missed) so I can spot-check it. Decline cases must decline; factual cases are
substring-checked (incl. date-relative "next" cases recomputed from today).

Suites:
  bench/domain.yaml          - (query, page) -> domain (resolve_domain)
  bench/pages.yaml           - site classifier label
  bench/course_pages.yaml    - course classifier label
  bench/questions.yaml       - site open-ended (rubric_points) + decline
  bench/course_questions.yaml- course factual + open-ended (rubric_points) + decline
  bench/pawsite_pages.yaml    - ProgramAsWeights product-site classifier labels
  bench/pawsite_questions.yaml- ProgramAsWeights factual + open-ended + decline
  bench/real_queries.yaml    - curated REAL traffic: route / factual / open / decline / nonenglish

Usage:
    python helper/eval.py
    python helper/eval.py --baseline      # also write bench/baseline.md
    python helper/eval.py --section open  # one section: domain|pages|open|factual|decline|route|real
"""

import argparse
import collections
import datetime
import pathlib

import yaml

import course_facts
from paw_helper import common, grader, pipeline

common.set_content_dir(pathlib.Path(__file__).resolve().parent)

BENCH = common.CONTENT_DIR / "bench"


def load(name: str) -> list:
    return yaml.safe_load((BENCH / name).read_text(encoding="utf-8")) or []


# ---- grading primitives ------------------------------------------------------

_MONTHS = [("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"),
           ("june", "jun"), ("july", "jul"), ("august", "aug"), ("september", "sep"),
           ("october", "oct"), ("november", "nov"), ("december", "dec")]


def _norm(s: str) -> str:
    s = s.lower()
    for lo, sh in _MONTHS:
        s = s.replace(lo, sh)
    return s


def _contains(answer, needles, mode):
    a = _norm(answer)
    hits = [n for n in needles if _norm(str(n)) in a]
    return len(hits) == len(needles) if mode == "all" else bool(hits)


def is_decline(answer: str) -> bool:
    a = answer.lower()
    # Matches "I don't have that information." (site/course) and "...that detail." (sub-answerers).
    return (not answer.strip() or "don't have that" in a or "do not have that" in a
            or "i'm not sure" in a or "i don't know" in a)


def factual_ok(p, answer, case):
    if "expected_next" in case:
        data = course_facts.load_course_data()
        provs = case["expected_next"] if isinstance(case["expected_next"], list) else [case["expected_next"]]
        needles = []
        for prov in provs:
            item = course_facts._next_due(data[prov], course_facts._today())
            due = course_facts._as_date(item["due"])
            needles.append(f"{due.strftime('%b')} {due.day}")
        return _contains(answer, needles, "any")
    if "expected_all" in case:
        return _contains(answer, case["expected_all"], "all")
    return _contains(answer, case["expected_any"], "any")


# ---- result accumulator ------------------------------------------------------

class Tally:
    def __init__(self):
        self.lines = []

    def add(self, *line):
        self.lines.append(" ".join(str(x) for x in line))

    def dump(self):
        print("\n".join(self.lines))
        return "\n".join(self.lines)


# ---- sections ----------------------------------------------------------------

def sec_domain(p, t):
    all_cases = load("domain.yaml")
    skipped = [c for c in all_cases if c.get("expected") not in p.available]
    cases = [c for c in all_cases if c.get("expected") in p.available]
    correct, conf = 0, []
    for c in cases:
        pred = p.resolve_domain(c["query"], c["page"])
        correct += pred == c["expected"]
        if pred != c["expected"]:
            conf.append((c["query"], c["page"], c["expected"], pred))
    t.add(f"\n=== Domain router ({len(cases)}) === {correct}/{len(cases)} = {correct/max(len(cases),1):.0%}"
          + (f"  (skipped {len(skipped)} unavailable-domain cases)" if skipped else ""))
    for q, pg, e, pr in conf:
        t.add(f"   miss: {q!r} [page={pg}] {e}->{pr}")
    return correct, len(cases)


def sec_classifier(p, t, domain, suite):
    cases = load(suite)
    correct = split = 0
    miss = []
    for c in cases:
        pred = p.classify(domain, c["query"])
        correct += pred == c["expected"]
        split += (pred == "question") == (c["expected"] == "question")
        if pred != c["expected"]:
            miss.append((c["query"], c["expected"], pred))
    n = len(cases)
    t.add(f"\n=== {domain} classifier ({suite}, {n}) === exact {correct}/{n}={correct/n:.0%}, "
          f"link-vs-q {split}/{n}={split/n:.0%}")
    for q, e, pr in miss:
        t.add(f"   miss: {q!r} {e}->{pr}")
    return correct, n


def sec_route_real(p, t):
    """Real route cases: run the FULL pipeline (page prior + router + classifier)."""
    cases = [c for c in load("real_queries.yaml") if c.get("cat") == "route"]
    correct, miss = 0, []
    for c in cases:
        meta = p.run(c["query"], c.get("page", "site"))
        pred = meta["route"]
        ok = pred == c["expected"]
        correct += ok
        if not ok:
            miss.append((c["query"], c.get("page", "site"), c["expected"], pred, c.get("note", "")))
    n = len(cases)
    t.add(f"\n=== REAL routing ({n}) === {correct}/{n} = {correct/n:.0%}")
    for q, pg, e, pr, note in miss:
        t.add(f"   miss: {q!r} [page={pg}] {e}->{pr}  {('('+note+')') if note else ''}")
    return correct, n


def sec_slides(p, t):
    rr = p.resource_routers.get(("course", "slides"))
    if not rr or rr["program"] not in p.programs:
        t.add("\n(slides: slide_selector not compiled - skipped)")
        return None
    cases = load("slides.yaml")
    correct, miss = 0, []
    for c in cases:
        items = p.resource_items(rr, c["query"])
        nums = [it["num"] for it in items]
        ok = bool(set(nums) & set(c["expected"]))
        correct += ok
        if not ok:
            miss.append((c["query"], c["expected"], nums))
    n = len(cases)
    t.add(f"\n=== Slide selector ({n}) === {correct}/{n} = {correct/n:.0%}")
    for q, e, got in miss:
        t.add(f"   miss: {q!r} expected one of {e}, got {got}")
    return correct, n


def _domain_for(p, case, default):
    page = case.get("page")
    return p.resolve_domain(case["query"], page) if page else default


def sec_factual(p, t):
    cases = []
    cases += [(c, "course") for c in load("course_questions.yaml")
              if any(k in c for k in ("expected_any", "expected_all", "expected_next"))]
    cases += [(c, "neuralos") for c in load("neuralos_questions.yaml")
              if any(k in c for k in ("expected_any", "expected_all"))]
    if "pawsite" in p.available:
        cases += [(c, "pawsite") for c in load("pawsite_questions.yaml")
                  if any(k in c for k in ("expected_any", "expected_all"))]
    cases += [(c, _domain_for(p, c, "site")) for c in load("real_queries.yaml") if c.get("cat") == "factual"]
    correct, miss = 0, []
    for c, dom in cases:
        ans, _ = p.freeform(dom, c["query"])
        ok = factual_ok(p, ans, c)
        correct += ok
        if not ok:
            miss.append((c["query"], ans))
    n = len(cases)
    t.add(f"\n=== Factual (auto, {n}) === {correct}/{n} = {correct/n:.0%}")
    for q, a in miss:
        t.add(f"   miss: {q!r} got: {a!r}")
    return correct, n


def sec_open(p, t, gfn):
    """Open-ended cases graded per-point by the rubric_checker; prints scorecards."""
    cases = []
    cases += [(c, "site") for c in load("questions.yaml") if "rubric_points" in c]
    cases += [(c, "course") for c in load("course_questions.yaml") if "rubric_points" in c]
    cases += [(c, "neuralos") for c in load("neuralos_questions.yaml") if "rubric_points" in c]
    if "pawsite" in p.available:
        cases += [(c, "pawsite") for c in load("pawsite_questions.yaml") if "rubric_points" in c]
    cases += [(c, "site") for c in load("site_topics.yaml") if "rubric_points" in c]
    cases += [(c, "site") for c in load("site_people.yaml") if "rubric_points" in c]
    cases += [(c, _domain_for(p, c, "site")) for c in load("real_queries.yaml") if c.get("cat") == "open"]
    passed = 0
    req_hit = req_tot = 0
    t.add(f"\n=== Open-ended (rubric-graded, {len(cases)}) ===")
    for c, dom in cases:
        ans, _ = p.freeform(dom, c["query"])
        sc = grader.score(gfn, c["query"], ans, c["rubric_points"])
        passed += sc["passed"]
        req_hit += sc["required_hits"]
        req_tot += sc["required_n"]
        misses = [r["point"] for r in sc["results"] if not r["hit"]]
        flag = "PASS" if sc["passed"] else "FAIL"
        t.add(f"  [{flag}] {c['query'][:46]!r}  req {sc['required_hits']}/{sc['required_n']}  ({dom})")
        t.add(f"        A: {ans[:130]}")
        if misses:
            t.add(f"        missed: {misses}")
    n = len(cases)
    t.add(f"  -> passed (all required hit): {passed}/{n} = {passed/n:.0%}; "
          f"required-point hit-rate {req_hit}/{req_tot} = {req_hit/max(req_tot,1):.0%}")
    return passed, n


def sec_decline(p, t):
    cases = []
    cases += [(c, "site") for c in load("questions.yaml") if c.get("expect_answerable") is False]
    cases += [(c, "course") for c in load("course_questions.yaml") if c.get("expect_answerable") is False]
    cases += [(c, "neuralos") for c in load("neuralos_questions.yaml") if c.get("expect_answerable") is False]
    if "pawsite" in p.available:
        cases += [(c, "pawsite") for c in load("pawsite_questions.yaml") if c.get("expect_answerable") is False]
    cases += [(c, "site") for c in load("site_topics.yaml") if c.get("expect_answerable") is False]
    cases += [(c, "site") for c in load("site_people.yaml") if c.get("expect_answerable") is False]
    cases += [(c, _domain_for(p, c, "site")) for c in load("real_queries.yaml")
              if c.get("cat") == "decline"]
    correct, miss = 0, []
    for c, dom in cases:
        ans, _ = p.freeform(dom, c["query"])
        ok = is_decline(ans)
        correct += ok
        if not ok:
            miss.append((c["query"], ans))
    n = len(cases)
    t.add(f"\n=== Decline (must not fabricate, {n}) === {correct}/{n} = {correct/n:.0%}")
    for q, a in miss:
        t.add(f"   NOT declined: {q!r} got: {a!r}")
    return correct, n


def sec_nonenglish(p, t):
    cases = [(c, _domain_for(p, c, "site")) for c in load("real_queries.yaml")
             if c.get("cat") == "nonenglish"]
    if not cases:
        return
    t.add(f"\n=== Non-English (informational, {len(cases)}; eyeball) ===")
    for c, dom in cases:
        ans, _ = p.freeform(dom, c["query"])
        t.add(f"   {c['query']!r} -> {ans!r}")


def sec_piazza(p, t):
    """Piazza branch: gate yes/no (needs piazza_gate compiled) + retrieval recall@k
    and privacy must-not-surface (need the server-only threads.json synced)."""
    suite = load("piazza.yaml")
    if not suite:
        return None
    import piazza
    summary = []

    # -- gate accuracy (course-owned logistics -> no; content/change/recency -> yes) --
    gate_cases = suite.get("gate", [])
    if "piazza_gate" in p.programs and gate_cases:
        correct, miss = 0, []
        for c in gate_cases:
            verdict = p._infer("piazza_gate", c["query"], p.mt.get("gate", 8)).strip().lower()
            pred = "yes" if verdict.startswith("yes") else "no"
            correct += pred == c["expected"]
            if pred != c["expected"]:
                miss.append((c["query"], c["expected"], pred))
        n = len(gate_cases)
        t.add(f"\n=== Piazza gate ({n}) === {correct}/{n} = {correct/n:.0%}")
        for q, e, pr in miss:
            t.add(f"   miss: {q!r} {e}->{pr}")
        summary.append(("piazza_gate", correct, n))

    # -- selection precision (the PAW reranker, via the SAME path runtime uses) --
    sel_cases = suite.get("selection", [])
    if "piazza_selector" in p.programs and sel_cases:
        correct, miss = 0, []
        for c in sel_cases:
            items = [{"label": title} for title in c["candidates"]]
            chosen = p._select_candidates("piazza_selector", c["query"], items)
            got = sorted(c["candidates"].index(it["label"]) + 1 for it in chosen)
            ok = got == sorted(c["expect"])
            correct += ok
            if not ok:
                miss.append((c["query"], sorted(c["expect"]), got))
        n = len(sel_cases)
        t.add(f"\n=== Piazza selection precision ({n}) === {correct}/{n} = {correct/n:.0%}")
        for q, e, g in miss:
            t.add(f"   miss: {q!r} expect {e} got {g}")
        summary.append(("piazza_selection", correct, n))
    else:
        t.add("\n(piazza selection: piazza_selector not compiled - skipped)")

    # -- retrieval + privacy (need synced data) --
    if not piazza.THREADS_PATH.exists():
        t.add(f"(piazza retrieval/privacy: no {piazza.THREADS_PATH} - skipped)")
        return summary or None

    ret_cases = suite.get("retrieval", [])
    correct, miss = 0, []
    for c in ret_cases:
        k = c.get("k", 3)
        ids = [r.get("thread_id") for r in piazza._INDEX.search(c["query"], k=k)]
        want = c["expect_thread"] if isinstance(c["expect_thread"], list) else [c["expect_thread"]]
        ok = bool(set(ids) & set(want))
        correct += ok
        if not ok:
            miss.append((c["query"], want, ids))
    n = len(ret_cases)
    if n:
        t.add(f"\n=== Piazza retrieval recall@k ({n}) === {correct}/{n} = {correct/n:.0%}")
        for q, want, ids in miss:
            t.add(f"   miss: {q!r} expected one of {want}, got {ids}")
        summary.append(("piazza_recall", correct, n))

    # -- RAG answer quality (synthesized from instructor threads, promoted to primary) --
    ans_cases = suite.get("answer", [])
    if "piazza_answerer" in p.programs and ans_cases:
        correct, miss = 0, []
        for c in ans_cases:
            res = p.run(c["query"], "course:cs486_s26")["result"]
            text = res.get("text", "") if res.get("type") == "answer" else ""
            ok = bool(text) and _contains(text, c["expect_any"], "any")
            correct += ok
            if not ok:
                miss.append((c["query"], text[:120]))
        n = len(ans_cases)
        t.add(f"\n=== Piazza RAG answer ({n}) === {correct}/{n} = {correct/n:.0%}")
        for q, a in miss:
            t.add(f"   miss: {q!r} got: {a!r}")
        summary.append(("piazza_answer", correct, n))

    # -- end-to-end triggering precision (search + selector + aggregate) --
    e2e_cases = suite.get("e2e", [])
    if "piazza_selector" in p.programs and e2e_cases:
        correct, miss = 0, []
        for c in e2e_cases:
            meta = p.run(c["query"], "course:cs486_s26")
            got = "piazza" in (meta.get("branches") or [])
            ok = got == c["expect_piazza"]
            correct += ok
            if not ok:
                miss.append((c["query"], c["expect_piazza"], got))
        n = len(e2e_cases)
        t.add(f"\n=== Piazza end-to-end triggering ({n}) === {correct}/{n} = {correct/n:.0%}")
        for q, e, g in miss:
            t.add(f"   miss: {q!r} expect_piazza={e} got={g}")
        summary.append(("piazza_e2e", correct, n))

    priv = suite.get("privacy", {})
    private_ids = set(priv.get("private_ids", []))
    piazza._INDEX._maybe_reload()
    index_ids = {th.get("thread_id") for th in piazza._INDEX.threads}
    leaked = private_ids & index_ids
    adv_hits = []
    for q in priv.get("adversarial", []):
        for r in piazza._INDEX.search(q, k=5):
            if r.get("thread_id") in private_ids:
                adv_hits.append((q, r.get("thread_id")))
    ok = not leaked and not adv_hits
    t.add(f"\n=== Piazza privacy (index has no private thread; adversarial don't surface) === "
          f"{'PASS' if ok else 'FAIL'}")
    if leaked:
        t.add(f"   LEAK: private ids in served index: {sorted(leaked)}")
    for q, tid in adv_hits:
        t.add(f"   LEAK: adversarial {q!r} surfaced private @{tid}")
    summary.append(("piazza_privacy", int(ok), 1))
    return summary


def sec_course_e2e(p, t):
    """Course-page OUTCOME suite (the deploy gate): grade the FULL pipeline result -
    WHICH source won the merge (main/piazza/augment) + answer content + must-decline.
    Needs the synced threads.json for the piazza-expected cases to resolve."""
    cases = load("course_e2e.yaml")
    if not cases:
        return None
    correct, miss = 0, []
    for c in cases:
        meta = p.run(c["query"], c.get("page", "course:cs486_s26"))
        res = meta["result"]
        src = meta.get("merge", "main")
        text = res.get("text") or res.get("label") or ""
        exp = c["expect_source"]
        exp = exp if isinstance(exp, list) else [exp]
        ok = src in exp
        if ok and c.get("expect_any"):
            ok = _contains(text, c["expect_any"], "any")
        if ok and c.get("decline"):
            ok = is_decline(text)
        correct += ok
        if not ok:
            miss.append((c["query"], exp, src, text[:80]))
    n = len(cases)
    t.add(f"\n=== Course outcome (source + content, {n}) === {correct}/{n} = {correct/n:.0%}")
    for q, exp, src, txt in miss:
        t.add(f"   miss: {q[:46]!r} want {exp} got {src!r}  A: {txt!r}")
    return correct, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="Write bench/baseline.md")
    ap.add_argument("--section", default=None)
    args = ap.parse_args()

    p = pipeline.Pipeline()
    import programasweights as paw
    gfn = paw.function(p.programs["rubric_checker"]) if "rubric_checker" in p.programs else None

    t = Tally()
    t.add(f"# Benchmark run {datetime.datetime.now().isoformat(timespec='seconds')}")
    t.add(f"# domains={p.available} programs={p.programs}")

    def want(s):
        return args.section is None or args.section == s

    summary = {}
    if want("domain"):
        summary["domain"] = sec_domain(p, t)
    if want("pages"):
        summary["site_class"] = sec_classifier(p, t, "site", "pages.yaml")
    if want("pages") and "course" in p.available:
        summary["course_class"] = sec_classifier(p, t, "course", "course_pages.yaml")
    if want("pages") and "neuralos" in p.available:
        summary["neuralos_class"] = sec_classifier(p, t, "neuralos", "neuralos_pages.yaml")
    if want("pages") and "pawsite" in p.available:
        summary["pawsite_class"] = sec_classifier(p, t, "pawsite", "pawsite_pages.yaml")
    if want("route"):
        summary["real_route"] = sec_route_real(p, t)
    if want("slides"):
        res = sec_slides(p, t)
        if res:
            summary["slides"] = res
    if want("factual"):
        summary["factual"] = sec_factual(p, t)
    if want("open") and gfn is not None:
        summary["open"] = sec_open(p, t, gfn)
    elif want("open"):
        t.add("\n(open-ended skipped: rubric_checker not compiled)")
    if want("decline"):
        summary["decline"] = sec_decline(p, t)
    if want("piazza"):
        res = sec_piazza(p, t)
        for name, c, n in (res or []):
            summary[name] = (c, n)
    if want("course_e2e"):
        res = sec_course_e2e(p, t)
        if res:
            summary["course_e2e"] = res
    if want("real"):
        sec_nonenglish(p, t)

    t.add("\n=== SUMMARY ===")
    for k, v in summary.items():
        if isinstance(v, tuple):
            t.add(f"  {k}: {v[0]}/{v[1]} = {v[0]/max(v[1],1):.0%}")

    body = t.dump()
    if args.baseline:
        (BENCH / "baseline.md").write_text("# Baseline (pre-hierarchical-change)\n\n```\n" + body + "\n```\n",
                                           encoding="utf-8")
        print(f"\nWrote {BENCH/'baseline.md'}")


if __name__ == "__main__":
    main()
