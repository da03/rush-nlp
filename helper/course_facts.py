"""Render CS 486/686 (Spring 2026) course facts from the canonical data file.

_data/cs486_s26.yaml is the single source of truth that also renders the course
web page. We render a compact facts sheet from it that is INJECTED into the
course answerer's input at inference time (not baked into the compiled program),
so a deadline/office-hour change needs only a server `git pull` - no recompile.

Facts are sliced into named sections so a future sub-topic router (and the
~2048-token PAW context window) can inject only the relevant slice. RAG context
(e.g. retrieved Piazza posts) will append to the same input the same way.
"""

import datetime
import pathlib

import yaml

HELPER_DIR = pathlib.Path(__file__).resolve().parent
COURSE_DATA_PATH = HELPER_DIR.parent / "_data" / "cs486_s26.yaml"


def load_course_data(path: pathlib.Path | None = None) -> dict:
    with open(path or COURSE_DATA_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _d(value) -> str:
    """Format a YAML date (or passthrough string) as e.g. 'Thu Jun 18, 2026'."""
    if isinstance(value, (datetime.date, datetime.datetime)):
        return f"{value.strftime('%a')} {value.strftime('%b')} {value.day}, {value.year}"
    return str(value)


def _as_date(value):
    if isinstance(value, datetime.datetime):
        return value.date()
    return value  # YAML parses bare dates to datetime.date already


def _today() -> datetime.date:
    return datetime.date.today()


def _next_due(items: list, today: datetime.date):
    """The soonest item whose due date is today or later (None if all passed).

    Computed in Python because the PAW function is stateless and never sees the
    current date - so 'next/upcoming' must be resolved deterministically here and
    injected, not left to the model to reason about.
    """
    upcoming = [it for it in items if _as_date(it["due"]) >= today]
    return min(upcoming, key=lambda it: _as_date(it["due"])) if upcoming else None


# --- section renderers: each returns a short markdown block -------------------

def _overview(c: dict) -> str:
    co = c["course"]
    secs = "; ".join(f"Section {s['id']} meets {s['time']} in room {s['room']}" for s in co["sections"])
    return (
        f"## Overview\n"
        f"- Today's date: {_d(_today())}.\n"
        f"- {co['code']} {co['title']} ({co['term']}), University of Waterloo.\n"
        f"- Instructor: {co['instructor']['name']} ({co['instructor']['email']}).\n"
        f"- Class dates: {co['dates']}.\n"
        f"- {secs}.\n"
        f"- Final exam: {co['final_exam']['window']} ({co['final_exam']['note']})."
    )


def _links(c: dict) -> str:
    li = c["course"]["links"]
    return (
        f"## Key links\n"
        f"- Piazza (Q&A forum): {li['piazza']}\n"
        f"- Chrysalis (chat-assignment platform): {li['chrysalis']}\n"
        f"- LEARN (assignment release/submission, grades): {li['learn']}"
    )


def _staff(c: dict) -> str:
    rows = []
    for t in c["tas"]:
        role = f" - {t['role']}" if t.get("role") else ""
        rows.append(f"- {t['name']} ({t['email']}){role}")
    return "## TAs\n" + "\n".join(rows)


def _office_hours(c: dict) -> str:
    rows = []
    for o in c["office_hours"]:
        where = o.get("location") or o.get("mode")
        mode = f"{o['mode']}" + (f" ({o['location']})" if o.get("location") else "")
        rows.append(f"- {o['day']} {o['time']}: {o['ta']} - {mode}")
    return f"## Office hours (start {c.get('office_hours_start', 'TBA')})\n" + "\n".join(rows)


def _deadlines(c: dict) -> str:
    # Due date FIRST (what students ask for); release date in parentheses. Notes
    # (one-off extension reasons) live on the web page. Omitting notes keeps the
    # injected context within the ~2048-token budget. The NEXT upcoming chat is
    # precomputed (the model can't, since it has no current date).
    rows = ["## Chat assignments (10 total, 2% each, on Chrysalis)"]
    nxt = _next_due(c["chats"], _today())
    rows.append(f"- Next chat due: Chat {nxt['num']} on {_d(nxt['due'])}." if nxt
                else "- All chat deadlines have passed.")
    for ch in c["chats"]:
        rows.append(f"- Chat {ch['num']}: due {_d(ch['due'])} (released {_d(ch['out'])})")
    return "\n".join(rows)


def _assignments(c: dict) -> str:
    rows = ["## Programming assignments (3 total, 30% total, on LEARN)"]
    nxt = _next_due(c["assignments"], _today())
    rows.append(f"- Next assignment due: Assignment {nxt['num']} on {_d(nxt['due'])}." if nxt
                else "- All assignment deadlines have passed.")
    for a in c["assignments"]:
        owner = a.get("owner") or "TBA"
        oe = f" ({a['owner_email']})" if a.get("owner_email") else ""
        rows.append(f"- Assignment {a['num']}: due {_d(a['due'])} (released {_d(a['out'])}); contact {owner}{oe}")
    return "\n".join(rows)


def _grading(c: dict) -> str:
    a = c["assessment"]
    cs486 = "; ".join(f"{x['label']} {x['weight']}" for x in a["cs486"])
    cs686 = "; ".join(f"{x['label']} {x['weight']}" for x in a["cs686"])
    return f"## Grading\n- CS 486: {cs486}.\n- CS 686: {cs686}."


def _readings(c: dict) -> str:
    r = c["readings"]
    p = r["primary"]
    sec = "; ".join(f"{s['title']} ({s['authors']})" for s in r.get("secondary", []))
    # Note field ("available online ... recommended") is omitted: the model tends
    # to echo it instead of naming the actual textbook.
    return (
        f"## Readings\n"
        f"- Primary textbook: {p['title']} by {p['authors']} ({p['edition']}).\n"
        f"- Secondary: {sec}."
    )


def _schedule(c: dict) -> str:
    modules, lectures = [], []
    for e in c["schedule"]:
        if e.get("type") == "module":
            modules.append(e["label"])
        elif e.get("type") == "lecture":
            lectures.append(f"L{e['lecture_num']} {e['topic']} ({_d(e['date'])})")
    return (
        "## Topics & schedule\n"
        f"- Modules: {', '.join(modules)}.\n"
        f"- Lectures: {'; '.join(lectures)}."
    )


SECTIONS: dict[str, callable] = {
    "overview": _overview,
    "links": _links,
    "staff": _staff,
    "office_hours": _office_hours,
    "deadlines": _deadlines,
    "assignments": _assignments,
    "grading": _grading,
    "readings": _readings,
    "schedule": _schedule,
}


def render_facts(data: dict | None = None, sections: list[str] | None = None) -> str:
    """Render the course facts sheet. `sections=None` renders everything."""
    c = data or load_course_data()
    keys = sections or list(SECTIONS)
    return "\n\n".join(SECTIONS[k](c) for k in keys if k in SECTIONS)


# Keyword cues per detail section. This is a lightweight, rule-based retriever:
# it selects which slices of the course sheet to inject so the input stays within
# the ~2048-token window. It is the same seam a future PAW sub-topic router or a
# Piazza RAG retriever plugs into (swap/augment selection, same injection point).
_SECTION_CUES: dict[str, tuple[str, ...]] = {
    # Note: "instructor"/"email" deliberately excluded - the instructor and their
    # email live in the always-on overview, so a TA list must not be pulled in for
    # "what is the instructor's email" (it would distract with a TA's email).
    "staff": ("ta", "tas", "teaching assistant", "who", "contact"),
    "office_hours": ("office hour", "office-hour", "oh", "zoom", "help", "in person", "in-person", "when can i meet"),
    "deadlines": ("chat", "deadline", "due", "when is", "extend", "chrysalis",
                  "next", "upcoming", "soon", "coming up", "this week", "today"),
    "assignments": ("assignment", "homework", "hw", "submit", "submission", "learn", "project", "starter",
                    "next", "upcoming", "soon", "coming up", "this week", "today"),
    "grading": ("grade", "grading", "weight", "percent", "%", "worth", "exam", "final", "pass", "mark", "marks", "project", "bonus", "cs686", "cs486", "686", "486"),
    "readings": ("textbook", "book", "read", "reading", "reference", "poole", "mackworth"),
    # Note: bare "lecture(s)" is excluded - it appears in logistics questions like
    # "what room are the lectures in", which should rely on the always-on overview
    # (room/time) rather than pulling the long lecture list and diluting it.
    "schedule": ("topic", "topics", "cover", "covered", "slide", "slides", "syllabus", "schedule", "module", "recap", "outline"),
}

# Always injected (small, high-value core) for redundancy: the overview alone
# answers many questions (instructor + email, sections, rooms, class dates, final
# exam window), so an unmatched query still has the essentials without pulling in
# distracting detail slices (e.g. a TA's email from the assignments section).
_CORE_SECTIONS = ["overview", "links"]


def select_sections(query: str) -> list[str]:
    q = query.lower()
    detail = [name for name, cues in _SECTION_CUES.items() if any(c in q for c in cues)]
    # No fallback detail: unmatched queries get just the core (overview + links).
    chosen = _CORE_SECTIONS + [s for s in SECTIONS if s in detail and s not in _CORE_SECTIONS]
    return chosen


def retrieve(query: str, data: dict | None = None) -> str:
    """Course context for a query: the relevant YAML slices (RAG hook)."""
    return render_facts(data, select_sections(query))


if __name__ == "__main__":
    full = render_facts()
    print(full)
    print(f"\n--- full: {len(full)} chars, ~{len(full)//4} tokens (rough) ---")
    for q in ["when is chat 5 due", "how is the course graded", "what topics are covered", "who is the TA for assignment 1"]:
        ctx = retrieve(q)
        print(f"[{q}] -> sections={select_sections(q)} ~{len(ctx)//4} tokens")
