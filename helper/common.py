"""Shared helpers for the yuntiandeng.com PAW helper.

Used by compile.py (to compose specs), server/app.py (to map link labels), and
eval.py (benchmark). Keeping spec composition here means the page_classifier
label list and the answerer facts are always derived from links.yaml / facts.md
- they never drift from a hand-copied list inside a spec.
"""

import json
import pathlib

import yaml

HELPER_DIR = pathlib.Path(__file__).resolve().parent
SPECS_DIR = HELPER_DIR / "specs"
LINKS_PATH = HELPER_DIR / "links.yaml"
FACTS_PATH = HELPER_DIR / "facts.md"
PROGRAMS_PATH = HELPER_DIR / "programs.json"

# Spec basenames in helper/specs/, mapped to the pipeline role.
SPEC_NAMES = ["page_classifier", "answerer", "validator"]


def load_links() -> dict:
    """label -> {url|kind, label, description, purpose}."""
    with open(LINKS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_programs() -> dict:
    with open(PROGRAMS_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_facts() -> str:
    return FACTS_PATH.read_text(encoding="utf-8").strip()


def build_links_block(links: dict) -> str:
    """Render links.yaml into the bullet list injected into the classifier spec."""
    return "\n".join(f"- {label}: {info['purpose']}" for label, info in links.items())


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
    """Read a spec template and inline {{LINKS}} / {{FACTS}} placeholders."""
    text = (SPECS_DIR / f"{name}.txt").read_text(encoding="utf-8")
    if "{{LINKS}}" in text:
        text = text.replace("{{LINKS}}", build_links_block(links or load_links()))
    if "{{FACTS}}" in text:
        text = text.replace("{{FACTS}}", load_facts())
    return text
