"""Thin helper for hand-curating the real query log into the benchmark (Step 2).

It ONLY pulls/loads a queries.jsonl, collapses exact duplicates, and prints the
queries grouped (sorted, so keystroke-prefixes like "where i" / "where is y" /
"where is your phd" sit together) in batches of ~20 with each query's logged
route/result. It deliberately does NOT prefix-dedup or categorize - those are
manual judgments I make by eyeballing each batch (see the plan's eyeball-first
guardrail).

Usage:
    # pull the server log first (no PII beyond query text is stored there):
    scp root@programasweights.com:/var/lib/yuntiandeng-helper/queries.jsonl /tmp/q.jsonl
    python helper/ingest_queries.py /tmp/q.jsonl --batch 20
"""

import argparse
import collections
import json
import pathlib

import common


def load(path: pathlib.Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default=str(common.HELPER_DIR / "queries.jsonl"))
    ap.add_argument("--batch", type=int, default=20)
    args = ap.parse_args()

    rows = load(pathlib.Path(args.path))
    # Collapse EXACT (case-insensitive) duplicates only; keep the most useful
    # logged route (prefer a concrete link route over "question" for context).
    by_key: dict[str, dict] = collections.OrderedDict()
    for r in rows:
        q = (r.get("query") or "").strip()
        if not q:
            continue
        key = q.lower()
        info = by_key.setdefault(key, {"query": q, "routes": set(), "results": set(), "pages": set()})
        if r.get("route"):
            info["routes"].add(r["route"])
        if r.get("result_type"):
            info["results"].add(r["result_type"])
        info["pages"].add(r.get("page") or "?")

    uniq = sorted(by_key.values(), key=lambda d: d["query"].lower())
    print(f"# {len(rows)} log lines -> {len(uniq)} exact-unique queries "
          f"(prefix/near-dup + categorization are MANUAL below)\n")
    for i, info in enumerate(uniq):
        if i % args.batch == 0:
            print(f"\n----- batch {i // args.batch + 1} (rows {i + 1}-{min(i + args.batch, len(uniq))}) -----")
        routes = ",".join(sorted(info["routes"])) or "-"
        results = ",".join(sorted(info["results"])) or "-"
        pages = ",".join(sorted(info["pages"]))
        print(f"{i + 1:3}. {info['query']!r:50}  route=[{routes}] result=[{results}] page=[{pages}]")


if __name__ == "__main__":
    main()
