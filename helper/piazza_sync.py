"""Sync CS 486/686 Piazza into a server-only thread index for the helper's Piazza branch.

PRIVACY: this writes class content to disk, so it must NEVER be committed (the repo
is public). It writes to PIAZZA_DATA_DIR (default helper/.piazza/, gitignored on the
server a real path like /var/lib/yuntiandeng-helper/piazza/). We keep only PUBLIC
posts that have an INSTRUCTOR/TA answer, drop private/student-only/unanswered posts,
strip HTML, and surface only the (sanitized) subject + thread link - never the
question body or follow-up discussion.

Credentials (env, never in the repo):
  PIAZZA_EMAIL, PIAZZA_PASSWORD   the instructor Piazza login
  PIAZZA_NID                      the class network id (from https://piazza.com/class/<NID>);
                                  if unset, the script lists your classes and exits
  PIAZZA_DATA_DIR                 output dir (default: <helper>/.piazza)

Usage:
  python helper/piazza_sync.py            # sync -> threads.json
  python helper/piazza_sync.py --inspect 3   # dump raw structure of 3 posts (verify filters)
  python helper/piazza_sync.py --limit 50    # cap for a quick test
"""

import argparse
import html
import json
import os
import pathlib
import re
import sys
import datetime

HELPER_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = pathlib.Path(os.environ.get("PIAZZA_DATA_DIR", str(HELPER_DIR / ".piazza")))
CLASS_URL = "https://piazza.com/class"


def _login():
    try:
        from piazza_api import Piazza
    except ImportError:
        sys.exit("piazza-api not installed. pip install piazza-api")
    email, password = os.environ.get("PIAZZA_EMAIL"), os.environ.get("PIAZZA_PASSWORD")
    if not (email and password):
        sys.exit("Set PIAZZA_EMAIL and PIAZZA_PASSWORD (a server secret; never commit them).")
    p = Piazza()
    p.user_login(email=email, password=password)
    return p


def _iter_posts(network, limit=None, sleep_s=2.0):
    """Yield full posts, throttled. Piazza rate-limits ("too fast"), so we list the
    feed once, then fetch each post with a delay + exponential backoff retry."""
    import time
    feed = network.get_feed(limit=limit or 999, offset=0)
    items = feed.get("feed", []) if isinstance(feed, dict) else (feed or [])
    nrs = [it.get("nr") for it in items if isinstance(it, dict) and it.get("nr") is not None]
    if limit:
        nrs = nrs[:limit]
    for nr in nrs:
        post = None
        for attempt in range(6):
            try:
                post = network.get_post(nr)
                break
            except Exception as e:  # noqa: BLE001 - retry only on rate limit
                if "too fast" in str(e).lower() or "rate" in str(e).lower():
                    time.sleep(3 * (attempt + 1))
                    continue
                raise
        if post is not None:
            yield post
        time.sleep(sleep_s)


def _strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _latest(history: list) -> dict:
    return history[0] if history else {}


def _instructor_answer(post: dict) -> str:
    """The instructor/TA answer text (i_answer child), stripped; '' if none."""
    for child in post.get("children", []):
        if child.get("type") == "i_answer":
            return _strip_html(_latest(child.get("history", [])).get("content", ""))
    return ""


def _is_public(post: dict) -> bool:
    """Class-visible only (verified against real data). Private posts have
    status 'private' AND/OR a restricted `config.feed_groups` (e.g. instr-only,
    `instr_<nid>,...`); exclude both. Only fully class-visible, active posts pass."""
    if post.get("status") != "active":
        return False
    if (post.get("config") or {}).get("feed_groups"):
        return False
    return True


def _is_instructor_note(post: dict) -> bool:
    """An instructor announcement/note (the instructor's own post, not a Q&A)."""
    return post.get("type") == "note" and "instructor-note" in (post.get("tags") or [])


def _thread(post: dict, nid: str) -> dict | None:
    """Keep a public post only if it carries INSTRUCTOR content: an instructor/TA
    answer to a question, or an instructor note/announcement. Drop everything else
    (unanswered, student-only, private)."""
    if not _is_public(post):
        return None
    answer = _instructor_answer(post)
    note = _is_instructor_note(post)
    if not (answer or note):
        return None
    h = _latest(post.get("history", []))
    subject = _strip_html(h.get("subject", "")) or f"@{post.get('nr')}"
    return {
        "thread_id": post.get("nr"),
        "subject": subject,                 # surfaced (sanitized) title
        "body": _strip_html(h.get("content", "")),   # ranking only (not displayed)
        "instructor_answer": answer,        # ranking only; "" for a pure note
        "kind": "note" if (note and not answer) else "qa",
        "folders": post.get("folders", []),
        "tags": [t for t in (post.get("tags") or []) if t != "student"],
        "url": f"{CLASS_URL}/{nid}?cid={post.get('nr')}",
        "updated": h.get("created") or post.get("modified"),
    }


def _resolve_nid(p) -> str:
    nid = os.environ.get("PIAZZA_NID")
    if nid:
        return nid
    classes = p.get_user_classes()
    print("PIAZZA_NID not set. Your classes (set PIAZZA_NID to the right `num`):")
    for c in classes:
        print(f"  num={c.get('nid')}  {c.get('num')} {c.get('name')} ({c.get('term')})")
    sys.exit(0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", type=int, default=0, help="Dump raw structure of N posts and exit.")
    ap.add_argument("--limit", type=int, default=0, help="Cap posts processed (testing).")
    args = ap.parse_args()

    p = _login()
    nid = _resolve_nid(p)
    network = p.network(nid)

    sleep_s = float(os.environ.get("PIAZZA_SLEEP", "2.0"))

    if args.inspect:
        # Eyeball real content (the class is public) AND verify the privacy filter:
        # for each post we print its visibility, what the filter decides, and the
        # actual subject/answer so we can confirm we keep the right things. Private
        # posts are clearly flagged and their content is NOT printed.
        for i, post in enumerate(_iter_posts(network, limit=args.inspect, sleep_s=sleep_s)):
            h = _latest(post.get("history", []))
            kids = [c.get("type") for c in post.get("children", [])]
            public = _is_public(post)
            kept = _thread(post, nid) is not None
            print(f"\n===== post {i}  @{post.get('nr')}  type={post.get('type')} =====")
            print(f"  status={post.get('status')}  feed_groups={(post.get('config') or {}).get('feed_groups')}")
            print(f"  folders={post.get('folders')}  tags={post.get('tags')}  children={kids}")
            print(f"  PUBLIC={public}  KEPT={kept}  ({'note' if _is_instructor_note(post) else 'qa' if _instructor_answer(post) else 'no instructor content'})")
            if not public:
                print("  [private/restricted -> content withheld]")
                continue
            print(f"  subject: {_strip_html(h.get('subject',''))!r}")
            print(f"  body:    {_strip_html(h.get('content',''))[:600]!r}")
            ans = _instructor_answer(post)
            if ans:
                print(f"  i_answer:{ans[:600]!r}")
        return

    threads, scanned = [], 0
    for post in _iter_posts(network, limit=args.limit or None, sleep_s=sleep_s):
        scanned += 1
        try:
            t = _thread(post, nid)
        except Exception:
            t = None
        if t:
            threads.append(t)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "nid": nid,
        "synced_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "n_scanned": scanned,
        "threads": threads,
    }
    (DATA_DIR / "threads.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {DATA_DIR/'threads.json'}: kept {len(threads)} endorsed-public threads of {scanned} scanned.")


if __name__ == "__main__":
    main()
