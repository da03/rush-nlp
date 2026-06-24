"""Piazza retrieval provider for the course helper's parallel branch.

Reads the server-only thread index (piazza_sync.py output) and ranks endorsed-public
threads against a query with BM25 (pure Python, via rank_bm25 - keeps the helper
light). Returns scored thread items the parallel-branch aggregator surfaces as
links (we never display post bodies; only the sanitized subject + thread URL).
Reloads when threads.json changes (nightly sync) so updates need no restart.
"""

import json
import os
import pathlib
import re
import threading
import time

HELPER_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = pathlib.Path(os.environ.get("PIAZZA_DATA_DIR", str(HELPER_DIR / ".piazza")))
THREADS_PATH = DATA_DIR / "threads.json"
_RELOAD_TTL_S = 300  # re-check the file at most every 5 min

_TOKEN = re.compile(r"[a-z0-9]+")


def _tok(s: str) -> list[str]:
    return _TOKEN.findall((s or "").lower())


class _Index:
    """Lazily-built, mtime-aware BM25 index over the synced threads."""

    def __init__(self):
        self.threads: list[dict] = []
        self.bm25 = None
        self.mtime = 0.0
        self.checked_at = 0.0
        self._lock = threading.Lock()

    def _maybe_reload(self) -> None:
        if self.bm25 is not None and time.time() - self.checked_at < _RELOAD_TTL_S:
            return
        with self._lock:
            self.checked_at = time.time()
            try:
                mtime = THREADS_PATH.stat().st_mtime
            except OSError:
                self.threads, self.bm25 = [], None
                return
            if self.bm25 is not None and mtime == self.mtime:
                return
            data = json.loads(THREADS_PATH.read_text(encoding="utf-8"))
            self.threads = data.get("threads", [])
            corpus = [_tok(f"{t.get('subject', '')} {t.get('body', '')} {t.get('instructor_answer', '')}")
                      for t in self.threads]
            if corpus:
                from rank_bm25 import BM25Okapi
                self.bm25 = BM25Okapi(corpus)
            else:
                self.bm25 = None
            self.mtime = mtime

    def search(self, query: str, k: int = 5) -> list[dict]:
        self._maybe_reload()
        if not self.bm25:
            return []
        scores = self.bm25.get_scores(_tok(query))
        ranked = sorted(zip(scores, self.threads), key=lambda sc: sc[0], reverse=True)[:k]
        out = []
        for score, t in ranked:
            folders = ", ".join(t.get("folders", []) or [])
            out.append({
                "label": t.get("subject") or f"@{t.get('thread_id')}",
                "url": t.get("url"),
                "description": "Piazza" + (f" - {folders}" if folders else ""),
                "score": float(score),
            })
        return out


_INDEX = _Index()


def search(query: str) -> list[dict]:
    """SEARCH_PROVIDERS entry: ranked thread items (label/url/description/score)."""
    return _INDEX.search(query)
