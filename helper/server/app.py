"""FastAPI inference service for the yuntiandeng.com "Ask about Yuntian" helper.

Runs the 3-program PAW pipeline server-side and exposes a single high-level
/ask endpoint to the browser widget, plus /feedback and /health.

Pipeline:
  1. page_classifier(query) -> a link label (from links.yaml) or "question"
  2. if a link label   -> return a link result (feedback label opens the form)
  3. if "question"     -> answerer(query) -> validator("Q: .. A: ..")
                          -> yes: return the answer; no/empty: fallback

All PAW inference runs locally via the SDK. Inference is serialized with a lock
(one shared model instance; low-traffic personal site).

Env:
  HELPER_ALLOWED_ORIGINS  comma-separated CORS origins
                          (default: https://yuntiandeng.com,https://www.yuntiandeng.com)
  HELPER_FEEDBACK_LOG     path to append feedback JSONL
                          (default: <helper>/feedback.jsonl)
"""

import datetime
import json
import os
import pathlib
import sys
import threading

import programasweights as paw
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Make helper/common.py importable when run from helper/server/.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import common  # noqa: E402

# --- Token budgets per stage ---
PC_MAX_TOKENS = 8       # one label
ANS_MAX_TOKENS = 96     # 1-2 sentences
VAL_MAX_TOKENS = 4      # yes / no

LINKS = common.load_links()
PROGRAMS = common.load_programs()["programs"]

_lock = threading.Lock()
_fns: dict[str, object] = {}


def _fn(name: str):
    if name not in _fns:
        _fns[name] = paw.function(PROGRAMS[name])
    return _fns[name]


def _infer(name: str, text: str, max_tokens: int) -> str:
    """Serialized, error-swallowing inference. Returns "" on any failure."""
    try:
        with _lock:
            return _fn(name)(text[:2000], max_tokens=max_tokens, temperature=0.0).strip()
    except Exception:
        return ""


app = FastAPI(title="yuntiandeng.com helper", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.environ.get(
            "HELPER_ALLOWED_ORIGINS",
            "https://yuntiandeng.com,https://www.yuntiandeng.com",
        ).split(",")
        if o.strip()
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


class AskRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)


@app.post("/ask")
def ask(req: AskRequest) -> dict:
    query = req.query.strip()
    if len(query) < 3:
        return {"type": "none"}

    label = common.normalize_label(_infer("page_classifier", query, PC_MAX_TOKENS), LINKS)

    if label != "question" and label in LINKS:
        info = LINKS[label]
        if info.get("kind") == "feedback":
            return {"type": "feedback", "label": info["label"], "description": info.get("description", "")}
        return {
            "type": "link",
            "label": info["label"],
            "url": info["url"],
            "description": info.get("description", ""),
        }

    # Freeform question path.
    answer = _infer("answerer", query, ANS_MAX_TOKENS)
    if len(answer) < 2:
        return {"type": "none"}

    verdict = _infer("validator", f"Q: {query} A: {answer}", VAL_MAX_TOKENS).lower()
    if verdict.startswith("yes"):
        return {"type": "answer", "text": answer}
    return {"type": "none"}


class FeedbackRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    email: str | None = Field(None, max_length=200)
    page_url: str | None = Field(None, max_length=500)


@app.post("/feedback")
def feedback(req: FeedbackRequest, request: Request) -> dict:
    log_path = os.environ.get(
        "HELPER_FEEDBACK_LOG", str(common.HELPER_DIR / "feedback.jsonl")
    )
    fwd = request.headers.get("X-Forwarded-For")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
    record = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "text": req.text,
        "email": req.email,
        "page_url": req.page_url,
        "ip": ip,
    }
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        # Never fail the request because logging failed.
        pass
    return {"message": "Thank you for your feedback!"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "programs": PROGRAMS}
