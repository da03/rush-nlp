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
    """Conservative: only class-visible, active posts. Private posts (student ->
    instructors) and deleted ones are excluded. We verify the exact fields against
    real data via --inspect before trusting this on the live class."""
    if post.get("status") not in (None, "active"):
        return False
    # Piazza marks instructor-only / private visibility in a few ways across versions.
    if post.get("config", {}).get("is_default") is False:
        pass  # not a reliable private signal; rely on status + bucket below
    bucket = (post.get("bucket_name") or "").lower()
    if "private" in bucket or "instructor" in bucket:
        return False
    return True


def _thread(post: dict, nid: str) -> dict | None:
    answer = _instructor_answer(post)
    if not answer:
        return None  # endorsed-public only: require an instructor/TA answer
    if not _is_public(post):
        return None
    h = _latest(post.get("history", []))
    subject = _strip_html(h.get("subject", "")) or f"@{post.get('nr')}"
    body = _strip_html(h.get("content", ""))
    return {
        "thread_id": post.get("nr"),
        "subject": subject,                 # surfaced (sanitized) title
        "body": body,                       # for ranking only (not displayed)
        "instructor_answer": answer,        # for ranking only (not displayed)
        "folders": post.get("folders", []),
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

    if args.inspect:
        # PII-SAFE: print STRUCTURE + non-content metadata only (never subjects,
        # bodies, or answers), so we can verify the privacy filter without leaking
        # class content into logs.
        for i, post in enumerate(network.iter_all_posts(limit=args.inspect)):
            h = _latest(post.get("history", []))
            kids = [c.get("type") for c in post.get("children", [])]
            scalars = {k: v for k, v in post.items()
                       if isinstance(v, (str, int, bool, float)) and len(str(v)) < 40}
            print(f"\n===== post {i} =====")
            print(f"  keys: {sorted(post.keys())}")
            print(f"  scalar metadata: {scalars}")
            print(f"  config: {post.get('config')}")
            print(f"  folders: {post.get('folders')}  tags: {post.get('tags')}")
            print(f"  children types: {kids}  has_i_answer: {'i_answer' in kids}")
            print(f"  subject_len: {len(h.get('subject', ''))}  content_len: {len(h.get('content', ''))}")
        return

    threads, scanned = [], 0
    for post in network.iter_all_posts(limit=args.limit or None):
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
