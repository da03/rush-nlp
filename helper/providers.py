"""Content-pack providers for the yuntiandeng.com helper.

The framework (pipeline.py / common.py) is content-agnostic; this module is the
content pack's single piece of Python. It registers, by name, how to produce the
runtime-injected facts and resource lists this pack's config.yaml refers to:

- CONTEXT_PROVIDERS: context key -> fn(query) -> facts text injected into the
  answerer for a domain with `facts_mode: runtime` (the seam a RAG retriever
  plugs into).
- CONTEXT_LABELS:    context key -> header label the facts are injected under
  (must match what the spec expects).
- RESOURCE_PROVIDERS: provider name -> (render_candidates() -> str,
  select(raw_selector_output) -> [ {num,topic,url}, ... ]) for a resource router.
"""

import common
import course_facts
import students_facts

# Runtime-injected fact providers (name -> fn(query) -> facts str). The RAG seam.
CONTEXT_PROVIDERS = {
    "course": course_facts.retrieve,
    "paw": lambda q: common.load_topic_facts("paw"),
    "neuralos": lambda q: common.load_topic_facts("neuralos"),
    "students": students_facts.render,
    "bio": lambda q: common.load_topic_facts("bio"),
}

# Header label each provider's facts are injected under (must match the spec).
CONTEXT_LABELS = {"course": "Course facts", "paw": "Facts", "neuralos": "Facts",
                  "students": "Facts", "bio": "Facts"}


def _select_slides(raw: str) -> list[dict]:
    """Parse the slide selector's output and map it to lecture deck items."""
    return course_facts.slides_for(course_facts.parse_lecture_nums(raw))


# Resource-router providers: (render candidate list, select items from selector
# output). The rule side (candidate list + id->URL) is deterministic; the fuzzy
# side is the selector PAW program. The generic hook for slides today.
RESOURCE_PROVIDERS = {
    "course_lectures": (course_facts.render_lectures, _select_slides),
}
