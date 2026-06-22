"""Render Yuntian's student roster for the students/recruiting sub-answerer.

The roster is the single source of truth in _data/members.yaml (which also renders
the public members page), so it is injected at inference time and stays consistent
and current with no recompile. We render the groups verbatim - current graduate
students/visitors vs undergrad alumni vs admitted-but-did-not-enroll - so the
answerer never lists an alum or a non-enrolling admit as a current student. The
recruiting policy is appended from helper/facts/students_extra.md.

Note: _data/members.yaml does not record PhD-vs-MMath degree levels (neither does
the members page), so we deliberately do not claim them.
"""

import pathlib

import yaml

from paw_helper import common

# This content pack shares _data/ with the Jekyll site at the repo root.
MEMBERS_PATH = pathlib.Path(__file__).resolve().parent.parent / "_data" / "members.yaml"

# Map the members.yaml group label to a clearer, status-explicit header.
_GROUP_HEADER = {
    "Graduate Students and Visitors": "Current graduate students and visitors",
    "Undergrad Alumni": "Undergraduate alumni (former students, no longer current)",
    "Admitted Students (Did Not Enroll)": "Admitted but did NOT enroll (never were and are not current students)",
}


def load_members(path: pathlib.Path | None = None) -> list:
    with open(path or MEMBERS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def render(query: str | None = None, data: list | None = None) -> str:
    groups = data or load_members()
    blocks = []
    n_current = 0
    for g in groups:
        header = _GROUP_HEADER.get(g["group"], g["group"])
        rows = []
        for p in g.get("people", []):
            research = f" - {p['research']}" if p.get("research") else ""
            rows.append(f"- {p['name']}{research}")
        if g["group"] == "Graduate Students and Visitors":
            n_current = len(rows)
        if rows:
            blocks.append(f"## {header}\n" + "\n".join(rows))
    # Inject the exact current count so the answerer never fabricates a number.
    blocks.insert(0, f"Yuntian currently has {n_current} students (the current graduate students and visitors listed below).")
    blocks.append(common.load_topic_facts("students_extra"))
    return "\n\n".join(blocks)


if __name__ == "__main__":
    text = render()
    print(text)
    print(f"\n--- {len(text)} chars, ~{len(text)//4} tokens ---")
