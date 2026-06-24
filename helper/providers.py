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

import course_facts
import piazza
import students_facts

from paw_helper import common

def _topic(name):
    """Bind a runtime facts file (facts/<name>.md) as a provider fn(query)->str."""
    return lambda q: common.load_topic_facts(name)


# Runtime-injected fact providers (name -> fn(query) -> facts str). The RAG seam.
# The ProgramAsWeights product helper is decomposed: each sub-answerer gets ONLY
# its topic's facts slice (facts/pawsite_<topic>.md), not the whole sheet, so the
# injected context stays small and on-topic.
CONTEXT_PROVIDERS = {
    "course": course_facts.retrieve,
    "paw": _topic("paw"),
    "pawsite_core": _topic("pawsite_core"),
    "pawsite_install": _topic("pawsite_install"),
    "pawsite_compile": _topic("pawsite_compile"),
    "pawsite_browser": _topic("pawsite_browser"),
    "pawsite_accounts": _topic("pawsite_accounts"),
    "pawsite_agents": _topic("pawsite_agents"),
    "pawsite_privacy": _topic("pawsite_privacy"),
    "pawsite_examples": _topic("pawsite_examples"),
    "pawsite_troubleshooting": _topic("pawsite_troubleshooting"),
    "neuralos": _topic("neuralos"),
    "students": students_facts.render,
    "bio": _topic("bio"),
}

# Header label each provider's facts are injected under (must match the spec).
# Only non-default labels need listing; everything else defaults to "Facts".
CONTEXT_LABELS = {"course": "Course facts"}


def _select_slides(raw: str) -> list[dict]:
    """Parse the slide selector's output and map it to lecture deck items."""
    return course_facts.slides_for(course_facts.parse_lecture_nums(raw))


# --- ProgramAsWeights source-code resource router -----------------------------
# The pawsite classifier emits a single generic `code` label; this fuzzy router
# disambiguates Python vs JavaScript vs the org page. Generic "source code" with
# no language named -> the org page (which lists both repos).
PAWSITE_REPOS = {
    "python": {"label": "Python SDK (GitHub)", "url": "https://github.com/programasweights/programasweights-python",
               "description": "Python package - pip install"},
    "js": {"label": "JavaScript SDK (GitHub)", "url": "https://github.com/programasweights/programasweights-js",
           "description": "Browser/npm package - @programasweights/web"},
    "org": {"label": "ProgramAsWeights on GitHub", "url": "https://github.com/programasweights",
            "description": "All source repositories"},
}


def _render_repos() -> str:
    return ("- python: the Python SDK / pip package\n"
            "- js: the JavaScript / npm / browser SDK\n"
            "- org: the GitHub organization listing all repositories")


def _select_repos(raw: str) -> list[dict]:
    """Map the code_selector output (python | js | both | org) to repo items."""
    s = raw.strip().lower()
    py, js = "python" in s, ("js" in s or "javascript" in s or "npm" in s)
    if "both" in s or (py and js):
        return [PAWSITE_REPOS["python"], PAWSITE_REPOS["js"]]
    if py:
        return [PAWSITE_REPOS["python"]]
    if js:
        return [PAWSITE_REPOS["js"]]
    return [PAWSITE_REPOS["org"]]


# Resource-router providers: (render candidate list, select items from selector
# output). The rule side is deterministic; the fuzzy side is the selector PAW
# program. Hooks: course slides and pawsite source code.
RESOURCE_PROVIDERS = {
    "course_lectures": (course_facts.render_lectures, _select_slides),
    "pawsite_code": (_render_repos, _select_repos),
}

# Parallel-branch search providers: name -> search(query) -> [{label,url,description,score}].
# The course page's Piazza branch ranks endorsed-public threads and surfaces links.
SEARCH_PROVIDERS = {
    "piazza": piazza.search,
}
