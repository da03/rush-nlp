"""Validate the rubric_checker against hand-labeled gold (Step 1 gate).

Runs the compiled rubric_checker over helper/bench/grader_meta.yaml and prints
its verdict next to MY gold label for EVERY triple (not just an aggregate), so I
can eyeball each one. Disagreements are flagged; false HITs (gold=no, pred=yes)
are called out separately because letting a missed point pass is the dangerous
failure mode for a grader.

Usage:
    python helper/grader_eval.py
"""

import yaml

import common
import grader

META = common.CONTENT_DIR / "bench" / "grader_meta.yaml"


def _gold(v) -> str:
    """YAML loads unquoted yes/no as booleans; normalize to 'yes'/'no'."""
    if isinstance(v, bool):
        return "yes" if v else "no"
    return str(v).strip().lower()


def main() -> None:
    import programasweights as paw

    cases = yaml.safe_load(META.read_text(encoding="utf-8"))
    programs = common.load_programs()["programs"]
    if "rubric_checker" not in programs:
        raise SystemExit("rubric_checker not compiled yet; run `python helper/compile.py --only rubric_checker`.")
    fn = paw.function(programs["rubric_checker"])

    agree = 0
    false_hit = []   # gold=no, pred=yes  (grader let a miss pass - worst case)
    false_miss = []  # gold=yes, pred=no  (grader failed a real hit)
    n_yes = sum(1 for c in cases if _gold(c["gold"]) == "yes")

    print(f"=== rubric_checker meta-eval ({len(cases)} triples; gold yes={n_yes}, no={len(cases)-n_yes}) ===\n")
    for c in cases:
        gold = _gold(c["gold"])
        pred = "yes" if grader.check_point(fn, c["q"], c["a"], c["point"]) else "no"
        ok = pred == gold
        agree += ok
        flag = "    " if ok else " ** "
        print(f"{flag}gold={gold:<3} pred={pred:<3} | {c['q'][:34]!r:36} :: {c['point'][:48]}")
        if not ok and gold == "no":
            false_hit.append(c)
        if not ok and gold == "yes":
            false_miss.append(c)

    n = len(cases)
    print(f"\nAgreement: {agree}/{n} = {agree / n:.0%}")
    print(f"False HITs (gold=no, pred=yes) - DANGEROUS: {len(false_hit)}")
    for c in false_hit:
        print(f"   - {c['q']!r} :: {c['point']}  (answer: {c['a'][:60]!r})")
    print(f"False MISSes (gold=yes, pred=no): {len(false_miss)}")
    for c in false_miss:
        print(f"   - {c['q']!r} :: {c['point']}  (answer: {c['a'][:60]!r})")


if __name__ == "__main__":
    main()
