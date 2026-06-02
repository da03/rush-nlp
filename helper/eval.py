"""Benchmark the helper pipeline.

Runs two suites against the compiled programs (directly via the PAW SDK):

  * bench/pages.yaml  - auto-graded page-classifier accuracy + the link-vs-question
                        split (the most important routing decision) + a confusion
                        list of misroutes.
  * bench/questions.yaml - runs answerer + validator and writes bench/report.md
                        with each Q -> answer -> validator verdict for MANUAL
                        grading against the rubric.

Usage:
    python helper/eval.py
"""

import pathlib

import yaml
import programasweights as paw

import common

BENCH = common.HELPER_DIR / "bench"
REPORT = BENCH / "report.md"

PC_MAX, ANS_MAX, VAL_MAX = 8, 200, 4


def main() -> None:
    links = common.load_links()
    programs = common.load_programs()["programs"]
    pc = paw.function(programs["page_classifier"])
    ans = paw.function(programs["answerer"])
    val = paw.function(programs["validator"])

    # ---- Suite 1: page classification (auto-graded) ----
    pages = yaml.safe_load((BENCH / "pages.yaml").read_text())
    correct = 0
    split_correct = 0
    misroutes = []
    for case in pages:
        q, expected = case["query"], case["expected"]
        pred = common.normalize_label(pc(q, max_tokens=PC_MAX, temperature=0.0), links)
        if pred == expected:
            correct += 1
        else:
            misroutes.append((q, expected, pred))
        # link-vs-question binary: is it a link or a question?
        if (pred == "question") == (expected == "question"):
            split_correct += 1

    n = len(pages)
    print(f"\n=== Page classifier ({n} cases) ===")
    print(f"Exact-label accuracy:   {correct}/{n} = {correct / n:.0%}")
    print(f"Link-vs-question split: {split_correct}/{n} = {split_correct / n:.0%}")
    if misroutes:
        print("Misroutes (query | expected | predicted):")
        for q, e, p in misroutes:
            print(f"  - {q!r}  {e} -> {p}")

    # ---- Suite 2: freeform answers (manual grading) ----
    questions = yaml.safe_load((BENCH / "questions.yaml").read_text())
    lines = [
        "# Helper freeform benchmark - manual grading sheet",
        "",
        f"Programs: `{programs}`",
        "",
        "Grade each answer against the rubric: write `correct`, `acceptable`, or `wrong`",
        "in the Grade column. `validator` is what the live pipeline would do (yes=show, no=fallback).",
        "",
    ]
    routed_as_question = 0
    for case in questions:
        q = case["query"]
        route = common.normalize_label(pc(q, max_tokens=PC_MAX, temperature=0.0), links)
        if route == "question":
            routed_as_question += 1
            a = ans(q, max_tokens=ANS_MAX, temperature=0.0).strip()
            verdict = val(f"Q: {q} A: {a}", max_tokens=VAL_MAX, temperature=0.0).strip()
        else:
            a = f"(routed to link: {route})"
            verdict = "n/a"
        lines += [
            f"## {q}",
            f"- expect_answerable: {case.get('expect_answerable')}",
            f"- rubric: {case.get('rubric', '')}",
            f"- route: {route}",
            f"- answer: {a}",
            f"- validator: {verdict}",
            "- Grade: ",
            "",
        ]

    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n=== Freeform answers ({len(questions)} cases) ===")
    print(f"Routed to the answerer: {routed_as_question}/{len(questions)}")
    print(f"Wrote {REPORT} for manual grading.")


if __name__ == "__main__":
    main()
