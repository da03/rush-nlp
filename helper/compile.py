"""Compile the helper's PAW programs and write helper/programs.json.

Usage:
    python helper/compile.py                      # default (fast) compiler
    python helper/compile.py --compiler paw-ft-bs48   # finetuned (slow, best)

Composes each spec (inlining links.yaml / facts.md), compiles it through the
hosted PAW API, and records the resulting program IDs. Commit programs.json so
the server runs a reproducible, pinned set of programs.

Requires network + the PAW SDK (see server/requirements.txt). Set PAW_API_KEY
for higher compile rate limits (optional).
"""

import argparse
import datetime
import json

import programasweights as paw

import common


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--compiler",
        default=None,
        help="PAW compiler name; omit to use the server default (paw-4b-qwen3-0.6b).",
    )
    args = ap.parse_args()

    links = common.load_links()
    programs: dict[str, str] = {}

    for name in common.SPEC_NAMES:
        spec = common.compose_spec(name, links)
        print(f"Compiling {name} ({len(spec)} chars){' with ' + args.compiler if args.compiler else ''} ...")
        program = paw.compile(spec, compiler=args.compiler)
        if getattr(program, "error", None):
            raise SystemExit(f"Compile failed for {name}: {program.error}")
        programs[name] = program.id
        print(f"  -> {program.id}")

    out = {
        "compiler": args.compiler or "default",
        "compiled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "programs": programs,
    }
    common.PROGRAMS_PATH.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {common.PROGRAMS_PATH}")


if __name__ == "__main__":
    main()
