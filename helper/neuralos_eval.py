"""End-to-end evaluator for the NeuralOS-demo helper experience (page=site:neuralos).

Runs the FULL pipeline (pipe.run) exactly as the live demo does, over the
hand-authored NeuralOS suites, and grades:

  bench/neuralos_pages.yaml      classifier route label (code/paper/feedback/question)
  bench/neuralos_questions.yaml  factual (substring) + open-ended (rubric_checker) + decline
  bench/domain.yaml (site:neuralos cases)  resolved domain (neuralos vs escape to site/course)

Use it BEFORE the change (baseline: no neuralos domain yet -> shows the context
gap) and AFTER (measures the improvement). Same harness either way.

    python helper/neuralos_eval.py                 # print scorecard
    python helper/neuralos_eval.py --baseline      # also write bench/neuralos_baseline.md
"""

import argparse
import datetime

import yaml

import common
import eval as ev   # reuse is_decline / _contains / factual primitives
import grader
import pipeline

BENCH = common.CONTENT_DIR / "bench"
PAGE = "site:neuralos"


def load(name):
    return yaml.safe_load((BENCH / name).read_text(encoding="utf-8")) or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true")
    args = ap.parse_args()

    p = pipeline.Pipeline()
    import programasweights as paw
    gfn = paw.function(p.programs["rubric_checker"]) if "rubric_checker" in p.programs else None

    out = []
    def add(*xs):
        out.append(" ".join(str(x) for x in xs))

    add(f"# NeuralOS-demo eval {datetime.datetime.now().isoformat(timespec='seconds')}")
    add(f"# page={PAGE} available_domains={p.available}")

    # ---- domain routing (escape / stay) ----
    dom_cases = [c for c in load("domain.yaml") if c.get("page") == PAGE]
    correct = 0
    add(f"\n=== Routing at {PAGE} ({len(dom_cases)}) ===")
    for c in dom_cases:
        got = p.resolve_domain(c["query"], PAGE)
        ok = got == c["expected"]
        correct += ok
        add(f"  [{'OK ' if ok else 'XX '}] {c['query'][:42]!r}  {c['expected']} {'==' if ok else '!='} {got}")
    add(f"  -> {correct}/{len(dom_cases)} = {correct/max(len(dom_cases),1):.0%}")

    # ---- classifier route label (full run) ----
    pg_cases = load("neuralos_pages.yaml")
    cok = 0
    add(f"\n=== Classifier route via full run ({len(pg_cases)}) ===")
    for c in pg_cases:
        meta = p.run(c["query"], PAGE)
        route = meta.get("route")
        rtype = meta["result"].get("type")
        # feedback label can surface either as route 'feedback' or a feedback result
        ok = (route == c["expected"]) or (c["expected"] == "feedback" and rtype == "feedback")
        cok += ok
        add(f"  [{'OK ' if ok else 'XX '}] {c['query'][:38]!r}  want {c['expected']:<8} got route={route} type={rtype} dom={meta.get('domain')}")
    add(f"  -> {cok}/{len(pg_cases)} = {cok/max(len(pg_cases),1):.0%}")

    # ---- questions: factual + open (rubric) + decline ----
    q_cases = load("neuralos_questions.yaml")
    fact = [c for c in q_cases if any(k in c for k in ("expected_any", "expected_all"))]
    openq = [c for c in q_cases if "rubric_points" in c]
    decl = [c for c in q_cases if c.get("expect_answerable") is False]

    fok = 0
    add(f"\n=== Factual (substring, {len(fact)}) ===")
    for c in fact:
        meta = p.run(c["query"], PAGE)
        ans = meta["result"].get("text", "") or ""
        ok = ev.factual_ok(p, ans, c)
        fok += ok
        add(f"  [{'OK ' if ok else 'XX '}] {c['query'][:40]!r}  got: {ans[:90]!r}")
    add(f"  -> {fok}/{len(fact)} = {fok/max(len(fact),1):.0%}")

    passed = 0
    add(f"\n=== Open-ended (rubric-graded, {len(openq)}) ===")
    for c in openq:
        meta = p.run(c["query"], PAGE)
        ans = meta["result"].get("text", "") or ""
        if gfn is not None and ans:
            sc = grader.score(gfn, c["query"], ans, c["rubric_points"])
            ok = sc["passed"]
            misses = [r["point"][:48] for r in sc["results"] if not r["hit"]]
        else:
            ok, misses = False, ["(no answer / grader)"]
        passed += ok
        add(f"  [{'PASS' if ok else 'FAIL'}] {c['query'][:38]!r} (dom={meta.get('domain')}, type={meta['result'].get('type')})")
        add(f"        A: {ans[:120]!r}")
        if misses:
            add(f"        missed: {misses}")
    add(f"  -> {passed}/{len(openq)} = {passed/max(len(openq),1):.0%}")

    dok = 0
    add(f"\n=== Decline (must not fabricate, {len(decl)}) ===")
    for c in decl:
        meta = p.run(c["query"], PAGE)
        ans = meta["result"].get("text", "") or ""
        rtype = meta["result"].get("type")
        ok = ev.is_decline(ans) or rtype == "none"
        dok += ok
        add(f"  [{'OK ' if ok else 'XX '}] {c['query'][:42]!r}  type={rtype} got: {ans[:80]!r}")
    add(f"  -> {dok}/{len(decl)} = {dok/max(len(decl),1):.0%}")

    add("\n=== SUMMARY ===")
    add(f"  routing:    {correct}/{len(dom_cases)}")
    add(f"  classifier: {cok}/{len(pg_cases)}")
    add(f"  factual:    {fok}/{len(fact)}")
    add(f"  open:       {passed}/{len(openq)}")
    add(f"  decline:    {dok}/{len(decl)}")

    body = "\n".join(out)
    print(body)
    if args.baseline:
        (BENCH / "neuralos_baseline.md").write_text(
            "# NeuralOS-demo baseline (BEFORE the neuralos-domain change)\n\n```\n" + body + "\n```\n",
            encoding="utf-8")
        print(f"\nWrote {BENCH/'neuralos_baseline.md'}")


if __name__ == "__main__":
    main()
