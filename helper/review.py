"""Review real helper usage to drive iterative polishing.

Summarizes the question log (and feedback log) the server writes:
  * total questions + how they routed (link vs freeform vs fallback)
  * the FALLBACK queries (result_type == none) - these are the gaps to fix in
    facts.md / links.yaml / the specs
  * the most frequent questions
  * recent feedback

Usage:
    python helper/review.py                         # defaults to helper/queries.jsonl + helper/feedback.jsonl
    python helper/review.py /path/to/queries.jsonl  # explicit log
    python helper/review.py --top 30

To review production logs, pull them first, e.g.:
    scp root@programasweights.com:/var/lib/yuntiandeng-helper/queries.jsonl /tmp/
    python helper/review.py /tmp/queries.jsonl
"""

import argparse
import collections
import json
import pathlib

HELPER_DIR = pathlib.Path(__file__).resolve().parent


def _load(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("queries", nargs="?", default=str(HELPER_DIR / "queries.jsonl"))
    ap.add_argument("--feedback", default=str(HELPER_DIR / "feedback.jsonl"))
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    rows = _load(pathlib.Path(args.queries))
    n = len(rows)
    print(f"=== Questions ({n}) from {args.queries} ===")
    if n:
        by_type = collections.Counter(r.get("result_type") for r in rows)
        by_route = collections.Counter(r.get("route") for r in rows)
        by_origin = collections.Counter((r.get("origin") or r.get("page") or "?") for r in rows)
        fallbacks = [r for r in rows if r.get("fallback")]
        print(f"result types: {dict(by_type)}")
        print(f"routes:       {dict(by_route)}")
        print(f"by origin:    {dict(by_origin)}")
        print(f"fallback rate: {len(fallbacks)}/{n} = {len(fallbacks)/n:.0%}")

        print(f"\n--- Fallback / unanswered queries ({len(fallbacks)}) - the polish targets ---")
        for r in fallbacks:
            src = r.get("origin") or r.get("page") or "?"
            print(f"  - {r.get('query')!r}  (origin={src}, route={r.get('route')}, validator={r.get('validator')})")

        print(f"\n--- Top {args.top} questions ---")
        freq = collections.Counter((r.get("query") or "").strip().lower() for r in rows)
        for q, c in freq.most_common(args.top):
            print(f"  {c:4d}  {q!r}")

    fb = _load(pathlib.Path(args.feedback))
    print(f"\n=== Feedback ({len(fb)}) from {args.feedback} ===")
    for r in fb[-args.top:]:
        email = f" <{r.get('email')}>" if r.get("email") else ""
        src = r.get("origin") or r.get("page_url") or ""
        src = f" ({src})" if src else ""
        print(f"  [{r.get('ts', '')[:19]}]{email}{src} {r.get('text')!r}")


if __name__ == "__main__":
    main()
