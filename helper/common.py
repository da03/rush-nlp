"""Shared helpers for the yuntiandeng.com PAW helper.

Used by compile.py (to compose specs), server/app.py (to map link labels), and
eval.py (benchmark). Keeping spec composition here means the page_classifier
label list and the answerer facts are always derived from links.yaml / facts.md
- they never drift from a hand-copied list inside a spec.
"""

import json
import pathlib
import re

import yaml

HELPER_DIR = pathlib.Path(__file__).resolve().parent
SPECS_DIR = HELPER_DIR / "specs"
LINKS_PATH = HELPER_DIR / "links.yaml"
COURSE_LINKS_PATH = HELPER_DIR / "course_links.yaml"
FACTS_PATH = HELPER_DIR / "facts.md"
PROGRAMS_PATH = HELPER_DIR / "programs.json"

# Spec basenames in helper/specs/, mapped to the pipeline role.
SPEC_NAMES = ["page_classifier", "answerer", "validator"]

# Which links file feeds a spec's {{LINKS}} placeholder (default: site links).
SPEC_LINK_SOURCE = {
    "page_classifier": "site",
    "answerer": "site",
    "course_classifier": "course",
}


def load_links() -> dict:
    """label -> {url|kind, label, description, purpose}."""
    with open(LINKS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_course_links() -> dict:
    with open(COURSE_LINKS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def links_for_spec(name: str) -> dict:
    """The links dict a given spec's {{LINKS}} should be filled from."""
    return load_course_links() if SPEC_LINK_SOURCE.get(name) == "course" else load_links()


def load_programs() -> dict:
    with open(PROGRAMS_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_facts() -> str:
    """facts.md content for the answerer spec, with maintainer-only notes removed.

    HTML comments (<!-- ... -->) are stripped so editor guidance in facts.md never
    gets compiled into the program.
    """
    text = FACTS_PATH.read_text(encoding="utf-8")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    # Collapse the blank lines left behind by removed comments.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_links_block(links: dict) -> str:
    """Render links.yaml into the bullet list injected into the classifier spec."""
    return "\n".join(f"- {label}: {info['purpose']}" for label, info in links.items())


def build_link_registry(links: dict) -> str:
    """name -> url list the answerer may hyperlink, derived from links.yaml.

    This is the single source of truth (links.yaml) reused in the answerer spec,
    not a hand-copied duplicate. Entries without a URL (e.g. feedback) are skipped,
    as are routing-only links flagged `registry: false` (e.g. social/profile pages
    the answerer should never inline in prose - those stay classifier-only).
    """
    return "\n".join(
        f"- {info.get('name') or info.get('label', label)}: {info['url']}"
        for label, info in links.items()
        if info.get("url") and info.get("registry", True)
    )


def normalize_label(raw: str, links: dict | None = None) -> str:
    """Map a raw page_classifier output to a known link label or 'question'.

    Unknown/malformed output falls back to 'question' (safer than a wrong link).
    Shared by the server and the benchmark so they score identically.
    """
    links = links if links is not None else load_links()
    s = raw.strip().lower().strip("\"'").strip(".")
    parts = s.split()
    s = parts[0] if parts else ""
    if s in links or s == "question":
        return s
    return "question"


def compose_spec(name: str, links: dict | None = None) -> str:
    """Read a spec template and inline {{LINKS}} / {{LINK_REGISTRY}} / {{FACTS}}.

    The {{LINKS}} placeholder is filled from the spec's link source (site links by
    default, course links for course_classifier); pass `links` to override.
    """
    text = (SPECS_DIR / f"{name}.txt").read_text(encoding="utf-8")
    spec_links = links or links_for_spec(name)
    if "{{LINKS}}" in text:
        text = text.replace("{{LINKS}}", build_links_block(spec_links))
    if "{{LINK_REGISTRY}}" in text:
        text = text.replace("{{LINK_REGISTRY}}", build_link_registry(spec_links))
    if "{{FACTS}}" in text:
        text = text.replace("{{FACTS}}", load_facts())
    return text
