"""Benchmark the helper pipeline (all domains), via the shared executor.

Runs the authored suites in helper/bench/ against the compiled programs:

  * domain.yaml          - top-level domain routing (page prior + router), auto-graded.
  * pages.yaml           - site page-classifier accuracy + link-vs-question split, auto.
  * course_pages.yaml    - course classifier accuracy + split, auto.
  * questions.yaml       - site freeform: answer + validator -> report.md (MANUAL grade).
  * course_questions.yaml- course freeform: factual cases AUTO-graded (expected_any/all),
                           open-ended + must-decline -> report.md (MANUAL grade).

Auto-graded suites print accuracy. Open-ended cases are written to bench/report.md
for manual grading against each rubric. A token-budget check and per-stage latency
summary round it out.

Usage:
    python helper/eval.py                 # all suites
    python helper/eval.py --suite domain course_pages
    python helper/eval.py --reconsider --no-backtrack   # ablate resilience knobs
"""

import argparse
import collections

import yaml

import common
import course_facts
import pipeline

BENCH = common.HELPER_DIR / "bench"
REPORT = BENCH / "report.md"


def _load(name: str) -> list:
    return yaml.safe_load((BENCH / name).read_text(encoding="utf-8"))


_MONTHS = [
    ("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"),
    ("june", "jun"), ("july", "jul"), ("august", "aug"), ("september", "sep"),
    ("october", "oct"), ("november", "nov"), ("december", "dec"),
]


def _norm(s: str) -> str:
    """Lowercase and collapse long month names to 3-letter, so 'August 5'
    matches an expected 'Aug 5' (and vice versa)."""
    s = s.lower()
    for long, short in _MONTHS:
        s = s.replace(long, short)
    return s


def _contains(answer: str, needles, mode: str) -> bool:
    a = _norm(answer)
    hits = [n for n in needles if _norm(str(n)) in a]
    return len(hits) == len(needles) if mode == "all" else bool(hits)


def _is_decline(answer: str) -> bool:
    a = answer.lower()
    return ("don't have that information" in a or "do not have that information" in a
            or "i don't know" in a or not answer.strip())


# ---- auto-graded suites ------------------------------------------------------

def eval_domain(p: pipeline.Pipeline) -> None:
    cases = _load("domain.yaml")
    correct, conf = 0, []
    for c in cases:
        pred = p.resolve_domain(c["query"], c["page"])
        if pred == c["expected"]:
            correct += 1
        else:
            conf.append((c["query"], c["page"], c["expected"], pred))
    n = len(cases)
    print(f"\n=== Domain router ({n} cases) ===")
    print(f"Accuracy: {correct}/{n} = {correct / n:.0%}")
    for q, pg, e, pr in conf:
        print(f"  - {q!r} [page={pg}]  {e} -> {pr}")


def eval_classifier(p: pipeline.Pipeline, domain: str, suite: str) -> None:
    cases = _load(suite)
    correct = split = 0
    misroutes = []
    for c in cases:
        pred = p.classify(domain, c["query"])
        exp = c["expected"]
        if pred == exp:
            correct += 1
        else:
            misroutes.append((c["query"], exp, pred))
        if (pred == "question") == (exp == "question"):
            split += 1
    n = len(cases)
    print(f"\n=== {domain} classifier ({suite}, {n} cases) ===")
    print(f"Exact-label accuracy:   {correct}/{n} = {correct / n:.0%}")
    print(f"Link-vs-question split: {split}/{n} = {split / n:.0%}")
    for q, e, pr in misroutes:
        print(f"  - {q!r}  {e} -> {pr}")


def eval_course_factual(p: pipeline.Pipeline) -> list[str]:
    """Auto-grade the factual course cases; return report lines for the manual ones."""
    cases = _load("course_questions.yaml")
    auto = [c for c in cases if "expected_any" in c or "expected_all" in c]
    decline = [c for c in cases if c.get("expect_answerable") is False]
    manual = [c for c in cases if "expected_any" not in c and "expected_all" not in c
              and c.get("expect_answerable") is not False]

    a_correct = 0
    a_fail = []
    for c in auto:
        ans, _ = p.freeform("course", c["query"])
        if "expected_all" in c:
            ok = _contains(ans, c["expected_all"], "all")
        else:
            ok = _contains(ans, c["expected_any"], "any")
        a_correct += ok
        if not ok:
            a_fail.append((c["query"], c.get("expected_all") or c.get("expected_any"), ans))

    d_correct = 0
    d_fail = []
    for c in decline:
        ans, _ = p.freeform("course", c["query"])
        ok = _is_decline(ans)
        d_correct += ok
        if not ok:
            d_fail.append((c["query"], ans))

    print(f"\n=== Course answerer - factual (auto, {len(auto)} cases) ===")
    print(f"Substring accuracy: {a_correct}/{len(auto)} = {a_correct / max(len(auto), 1):.0%}")
    for q, exp, ans in a_fail:
        print(f"  - {q!r}  expected~{exp}  got: {ans!r}")
    print(f"\n=== Course answerer - must-decline (auto, {len(decline)} cases) ===")
    print(f"Declined correctly: {d_correct}/{len(decline)} = {d_correct / max(len(decline), 1):.0%}")
    for q, ans in d_fail:
        print(f"  - {q!r}  did NOT decline: {ans!r}")

    # Manual (open-ended rubric) + must-decline confirmations -> report lines.
    lines = ["", "# Course open-ended (manual grade)", ""]
    for c in manual + decline:
        route = p.classify("course", c["query"])
        ans, verdict = p.freeform("course", c["query"])
        lines += [
            f"## {c['query']}",
            f"- expect_answerable: {c.get('expect_answerable', True)}",
            f"- rubric: {c.get('rubric', '')}",
            f"- route: {route}",
            f"- answer: {ans}",
            f"- validator: {verdict}",
            "- Grade: ",
            "",
        ]
    return lines


def eval_site_freeform(p: pipeline.Pipeline) -> list[str]:
    """Site freeform suite -> report lines (manual), mirroring the original eval."""
    cases = _load("questions.yaml")
    lines = ["# Site freeform (manual grade)", ""]
    routed = 0
    for c in cases:
        route = p.classify("site", c["query"])
        if route == "question":
            routed += 1
            ans, verdict = p.freeform("site", c["query"])
        else:
            ans, verdict = f"(routed to link: {route})", "n/a"
        lines += [
            f"## {c['query']}",
            f"- expect_answerable: {c.get('expect_answerable')}",
            f"- rubric: {c.get('rubric', '')}",
            f"- route: {route}",
            f"- answer: {ans}",
            f"- validator: {verdict}",
            "- Grade: ",
            "",
        ]
    print(f"\n=== Site freeform ({len(cases)} cases) ===")
    print(f"Routed to the answerer: {routed}/{len(cases)}")
    return lines


def token_budget_check(p: pipeline.Pipeline) -> None:
    budget = p.cfg.get("token_budget", 2048)
    print(f"\n=== Token budget (limit ~{budget}) ===")
    for name in ["page_classifier", "answerer", "course_classifier", "domain_router", "validator"]:
        try:
            spec = common.compose_spec(name)
        except FileNotFoundError:
            continue
        print(f"  {name}: ~{len(spec) // 4} tok spec")
    # Worst-case course answerer input = spec + full-sheet context + Q + A.
    course_spec = common.compose_spec("course_answerer")
    worst_ctx = course_facts.render_facts()
    total = (len(course_spec) + len(worst_ctx)) // 4 + p.cfg["max_tokens"]["answerer"]
    flag = "  <-- OVER BUDGET" if total > budget else ""
    print(f"  course_answerer worst case (spec+full sheet+answer): ~{total} tok{flag}")


def latency_summary(p: pipeline.Pipeline) -> None:
    agg = collections.defaultdict(lambda: [0, 0.0])
    for node, dt in p.timings:
        agg[node][0] += 1
        agg[node][1] += dt
    print("\n=== Latency per node (count, total s, mean ms) ===")
    for node, (cnt, tot) in sorted(agg.items()):
        print(f"  {node}: {cnt} calls, {tot:.1f}s total, {tot / max(cnt, 1) * 1000:.0f}ms mean")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--suite", nargs="*", default=None,
                    help="Subset: domain pages course_pages questions course_questions")
    ap.add_argument("--reconsider", action="store_true", help="Override resilience.reconsider=true")
    ap.add_argument("--no-backtrack", action="store_true", help="Override resilience.backtrack=false")
    args = ap.parse_args()

    p = pipeline.Pipeline()
    if args.reconsider:
        p.resilience["reconsider"] = True
    if args.no_backtrack:
        p.resilience["backtrack"] = False
    print(f"Available domains: {p.available}")
    print(f"Resilience: {p.resilience}")

    suites = set(args.suite) if args.suite else None
    def want(name): return suites is None or name in suites

    report = []
    if want("domain") and "domain_router" in p.programs and len(p.available) > 1:
        eval_domain(p)
    if want("pages"):
        eval_classifier(p, "site", "pages.yaml")
    if want("course_pages") and "course" in p.available:
        eval_classifier(p, "course", "course_pages.yaml")
    if want("questions"):
        report += eval_site_freeform(p)
    if want("course_questions") and "course" in p.available:
        report += eval_course_factual(p)

    if report:
        REPORT.write_text("\n".join(report), encoding="utf-8")
        print(f"\nWrote {REPORT} for manual grading.")

    token_budget_check(p)
    latency_summary(p)


if __name__ == "__main__":
    main()
