# Deploying the helper service (helper.yuntiandeng.com)

The helper backend runs on the `programasweights.com` server; `helper.yuntiandeng.com`
already points there. The static site (yuntiandeng.com) on GitHub Pages calls it,
and neural-os.com embeds the same backend cross-origin.

This `helper/` directory is a **paw-helper content pack**: the framework
([programasweights/paw-helper](https://github.com/programasweights/paw-helper))
provides the server/runtime; this pack provides the config, specs, facts, links,
`providers.py`, and the pinned `programs.json`.

## One-time setup on the server

```bash
# 1. Check out the content-pack repo and the framework (server has GitHub creds).
sudo mkdir -p /opt/yuntiandeng-helper && cd /opt/yuntiandeng-helper
git clone git@github.com:da03/rush-nlp.git repo
git clone git@github.com:programasweights/paw-helper.git

# 2. Python venv + the framework (pulls fastapi/uvicorn/pydantic/pyyaml/httpx + PAW SDK).
python3 -m venv /opt/yuntiandeng-helper/venv
/opt/yuntiandeng-helper/venv/bin/pip install -e /opt/yuntiandeng-helper/paw-helper \
    --extra-index-url https://pypi.programasweights.com/simple/

# 3. Writable dirs for the model cache and logs.
sudo mkdir -p /var/lib/yuntiandeng-helper/paw-cache
sudo touch /var/lib/yuntiandeng-helper/feedback.jsonl /var/lib/yuntiandeng-helper/queries.jsonl

# 4. Service. The base unit runs `paw-helper serve` against this content pack
#    (PAW_HELPER_CONTENT). The CORS allow-list lives in the unit (see below).
sudo cp helper/deploy/helper.service /etc/systemd/system/yuntiandeng-helper.service
sudo systemctl daemon-reload
sudo systemctl enable --now yuntiandeng-helper

# 5. nginx vhost + TLS.
sudo cp helper/deploy/helper.nginx.conf /etc/nginx/sites-available/helper.yuntiandeng.com
sudo ln -s /etc/nginx/sites-available/helper.yuntiandeng.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d helper.yuntiandeng.com
```

> **nginx config deploy safety (this server hosts several vhosts).** The repo's
> `*.nginx.conf` files DRIFT from what is actually live (this server has had a
> live-only `Access-Control-Allow-Origin *` and an `/avatar` block that the repo
> lacked). Before overwriting any live nginx file with a repo copy:
> 1. Find the ACTUALLY-served file - `sudo nginx -T | grep -n "server_name <host>"` -
>    it may be a differently-named file in `sites-enabled/`, not `sites-available/`.
> 2. `diff` live vs the repo file; the ONLY differences should be your intended change.
>    If live has extra blocks, reconcile the repo to match live FIRST - never clobber
>    live with a stale repo file.
> 3. Back up the live file to `/root` (NEVER into `sites-enabled/` - `include
>    sites-enabled/*` loads every file there, so a `.bak` becomes a duplicate `server`).
> 4. `sudo nginx -t` before `sudo systemctl reload nginx`; restore the backup if it fails.
> (certbot also edits this file in place, which is a common source of the drift above.)

Verify:

```bash
/opt/yuntiandeng-helper/venv/bin/paw-helper validate --content /opt/yuntiandeng-helper/repo/helper
curl https://helper.yuntiandeng.com/health
curl -s https://helper.yuntiandeng.com/ask -H 'Content-Type: application/json' \
     -d '{"query":"where is your cv"}'
```

## Updating after a content/spec change

```bash
# On your laptop: edit specs/facts/links, recompile, commit programs.json.
paw-helper compile --content helper --compiler paw-ft-bs48
git add helper/ && git commit -m "Update helper" && git push

# On the server:
cd /opt/yuntiandeng-helper/repo && git pull
sudo systemctl restart yuntiandeng-helper
```

`programs.json` is committed, so the server always runs the exact pinned programs
you compiled and tested. No compilation happens on the server. Recompiling is only
needed when a **spec** in `helper/specs/` changes (the model's behavior).

## Updating the framework (paw-helper)

```bash
# On the server:
cd /opt/yuntiandeng-helper/paw-helper && git pull
/opt/yuntiandeng-helper/venv/bin/pip install -e . --no-deps   # entry point + code
sudo systemctl restart yuntiandeng-helper
```

## Rollback

```bash
# Content pack:
cd /opt/yuntiandeng-helper/repo && git checkout <last-good-commit> && sudo systemctl restart yuntiandeng-helper
# Framework:
cd /opt/yuntiandeng-helper/paw-helper && git checkout <last-good-tag> \
    && /opt/yuntiandeng-helper/venv/bin/pip install -e . --no-deps && sudo systemctl restart yuntiandeng-helper
```

### Course content changes need no recompile

The course assistant injects facts at inference time from `_data/cs486_s26.yaml`
(rendered by `helper/course_facts.py`), so editing course deadlines, office hours,
TAs, etc. is just commit + `git pull` + restart - no recompile.

## Embedding the widget on other sites (one shared backend)

The backend serves a self-contained widget at `/widget.js` (this pack ships its
own `helper/widget.js`, which the framework serves in place of its default), so any
of Yuntian's sites can embed the helper and talk to this one backend cross-origin.

- Static site you control: add the script tag to the page HTML.
  ```html
  <script src="https://helper.yuntiandeng.com/widget.js" data-page="site:neuralos"></script>
  ```
- Proxied app you can't edit (e.g. neural-os.com's Gradio): inject the tag with
  an nginx `sub_filter` on the upstream HTML. See
  [`embed.nginx.example`](embed.nginx.example) for the full snippet (key bit:
  `proxy_set_header Accept-Encoding "";` so sub_filter can rewrite the body).
  Put any backups OUTSIDE `sites-enabled/` (nginx loads every file there).

Each embedding origin must be in `HELPER_ALLOWED_ORIGINS` (below). `/widget.js`
itself is public and not CORS-gated; only the data endpoints are.

### The systemd drop-in (serve config + CORS allow-list)

The base unit is hand-tunable; the deploy applies the serve command, content path,
and CORS allow-list via a non-destructive drop-in so the base unit stays intact:

```bash
sudo install -d /etc/systemd/system/yuntiandeng-helper.service.d
sudo tee /etc/systemd/system/yuntiandeng-helper.service.d/override.conf >/dev/null <<'EOF'
[Service]
WorkingDirectory=/opt/yuntiandeng-helper/repo/helper
Environment=PAW_HELPER_CONTENT=/opt/yuntiandeng-helper/repo/helper
Environment=HELPER_ALLOWED_ORIGINS=https://yuntiandeng.com,https://www.yuntiandeng.com,https://neural-os.com,https://www.neural-os.com,https://programasweights.com,https://www.programasweights.com
Environment=PAW_HELPER_INFERENCE_BACKEND=remote_infer
Environment=PAW_HELPER_INFER_ENDPOINT=https://programasweights.com/api/v1/infer
EnvironmentFile=/etc/yuntiandeng-helper/paw.env
ExecStart=
ExecStart=/opt/yuntiandeng-helper/venv/bin/paw-helper serve --host 127.0.0.1 --port 8088
EOF
sudo systemctl daemon-reload && sudo systemctl restart yuntiandeng-helper
```

CRITICAL - `remote_infer` needs a PAW API key. `/api/v1/infer` authenticates via
the `X-API-Key` header; WITHOUT a valid key the calls are ANONYMOUS and hit a strict
per-IP rate limit (~100/hr) -> 429 -> blank answers under any real load. systemd does
NOT source `~/.bashrc`, so the key must be provided to the service explicitly (the
`EnvironmentFile` above). Set it with a VALID, current prod key (a stale/rotated key
silently resolves to anonymous - same blank-answer symptom):

```bash
sudo tee /etc/yuntiandeng-helper/paw.env >/dev/null <<'EOF'
PAW_API_KEY=paw_sk_...   # a current prod key; X-API-Key auth (NOT Authorization: Bearer)
EOF
sudo chmod 600 /etc/yuntiandeng-helper/paw.env
sudo systemctl restart yuntiandeng-helper
# Verify it authenticated (200, not 429): a raw call returns output, and the helper's
# concurrent requests stop returning blanks.
```

Authenticated tier: ~300-900 infer/hr and 5 concurrent in-flight per key (the helper
makes ~5-10 infer calls per query, so heavy concurrency can still hit the 5-concurrent
cap - bump the helper key's tier server-side if needed). `local_sdk` is the no-rate-limit
fallback (set `PAW_HELPER_INFERENCE_BACKEND=local_sdk`) if the API is unavailable.

Verify: `curl -s -D- -o/dev/null -X POST https://helper.yuntiandeng.com/ask -H 'Origin: https://neural-os.com' -H 'Content-Type: application/json' -d '{"query":"hi"}' | grep -i access-control-allow-origin`

## Piazza branch (course page RAG)

On the **course page only**, a parallel branch answers from relevant
**endorsed-public** Piazza threads. It is over-call -> rerank -> answer -> MERGE
(no up-front topic gate): `piazza.py` (BM25) recalls candidate threads;
`piazza_selector` (PAW) keeps only the genuinely relevant ones (or none);
`piazza_answerer` (PAW) synthesizes a concise answer from the kept threads' endorsed
instructor replies (or declines); then `piazza_merge` (PAW), shown the QUESTION + the
course answer + the Piazza answer, decides `main` (course owns it - e.g. office
hours, grading, deadlines - no hijack), `augment` (course answer + Piazza citation),
or `branch` (promote the Piazza answer). Deciding from BOTH answers is far more
robust than a finetuned yes/no gate on the query alone. A recency query ("latest
posts") returns the most-recent threads directly. The branch runs concurrently with
the main answer (~0 wall time on remote_infer).

**Privacy**: `piazza_sync.py` keeps only PUBLIC posts that carry instructor
content (an instructor/TA answer, or an instructor note). Private threads
(`status=private` or a restricted `config.feed_groups`) are excluded even when
answered. The synced `threads.json` lives ONLY on the server (`PIAZZA_DATA_DIR`),
never in the public repo.

```bash
# 1. Deps (BM25 + the Piazza client).
/opt/yuntiandeng-helper/venv/bin/pip install rank-bm25 piazza-api

# 2. Server-only credentials (chmod 600; NEVER commit).
sudo install -d /etc/yuntiandeng-helper
sudo tee /etc/yuntiandeng-helper/piazza.env >/dev/null <<'EOF'
PIAZZA_EMAIL=instructor@example.com
PIAZZA_PASSWORD=...
PIAZZA_NID=mp1dvecnhq8q4
EOF
sudo chmod 600 /etc/yuntiandeng-helper/piazza.env

# 3. Point the running helper at the synced index (drop-in), then restart.
sudo tee /etc/systemd/system/yuntiandeng-helper.service.d/piazza.conf >/dev/null <<'EOF'
[Service]
Environment=PIAZZA_DATA_DIR=/var/lib/yuntiandeng-helper/piazza
EOF

# 4. Nightly sync (the helper hot-reloads threads.json within 5 min, no restart).
sudo cp helper/deploy/piazza-sync.service /etc/systemd/system/yuntiandeng-helper-piazza-sync.service
sudo cp helper/deploy/piazza-sync.timer   /etc/systemd/system/yuntiandeng-helper-piazza-sync.timer
sudo systemctl daemon-reload
sudo systemctl enable --now yuntiandeng-helper-piazza-sync.timer
sudo systemctl start yuntiandeng-helper-piazza-sync.service   # first sync now
sudo systemctl restart yuntiandeng-helper
```

Eyeball / verify (the class is public, so inspecting content is expected):

```bash
# Dump real content + the keep/drop decision for the first N posts.
sudo PIAZZA_DATA_DIR=/var/lib/yuntiandeng-helper/piazza \
  bash -c 'set -a; . /etc/yuntiandeng-helper/piazza.env; set +a; \
  /opt/yuntiandeng-helper/venv/bin/python /opt/yuntiandeng-helper/repo/helper/piazza_sync.py --inspect 8'

# Benchmark the branch on the synced data (selection / recall@k / e2e / privacy).
cd /opt/yuntiandeng-helper/repo/helper && PIAZZA_DATA_DIR=/var/lib/yuntiandeng-helper/piazza \
  PAW_HELPER_CONTENT=$PWD /opt/yuntiandeng-helper/venv/bin/python eval.py --section piazza
```

Tuning lives in `config.yaml` under `domains.course.parallel_branches`: `min_score`
(BM25 recall floor), `select_k` (candidates handed to the selector), `max_items`.
`bench/piazza.yaml` is the regression suite; re-tune as the corpus grows.

## Pre-deploy evaluation gate (REQUIRED)

Every change is gated on the benchmark suite - this is the discipline that catches
regressions like the "office hours -> Piazza hijack" before they ship. Run BOTH the
golden snapshot and the outcome suite.

Backend note: finetuned programs can decide borderline cases slightly differently
across `local_sdk` vs `remote_infer`, so run the suite on the SAME backend the server
uses. With a VALID `PAW_API_KEY` (authenticated tier), the full per-domain suites run
fine on `remote_infer` (all four domains are 100% there). WITHOUT a key (anonymous),
`remote_infer` rate-limits after ~100 calls and returns blank answers - if you see a
suite suddenly collapse to lots of empty/`none` results, the key is missing/stale, not
a behavior regression. `local_sdk` (no rate limit) is the reliable fallback.

```bash
# On the server (so threads.json is available). Full suite on local_sdk (reliable).
cd /opt/yuntiandeng-helper/repo/helper
export PIAZZA_DATA_DIR=/var/lib/yuntiandeng-helper/piazza PAW_HELPER_CONTENT=$PWD
export PAW_HELPER_INFERENCE_BACKEND=local_sdk

# 1. Behavior-preserving check (no unrelated response changed).
python snapshot.py --check

# 2. Outcome gate per domain (the FINAL user-facing result: domain routing, result
#    kind, content, must-decline). One suite per page; all should stay green.
python eval.py --section course_e2e      # course (+ Piazza merge: main/piazza/augment)
python eval.py --section site_e2e        # yuntiandeng.com   (page=site)
python eval.py --section neuralos_e2e    # neural-os.com     (page=site:neuralos)
python eval.py --section pawsite_e2e     # programasweights.com (page=site:paw)

# 3. Classifier routing (link-vs-question) + component diagnostics.
python eval.py --section pages           # all domains' classifiers
python eval.py --section piazza          # Piazza merge/selector/recall/answer/privacy

# 4. Spot-check a few key cases on the LIVE backend (remote_infer) via the running
#    service, to catch backend divergence without a full-suite burst:
for q in "what are the office hours" "what changed about assignment 1" "is assignment 3 released yet"; do
  curl -s -X POST 127.0.0.1:8088/ask -H 'Content-Type: application/json' \
    -d "{\"query\":\"$q\",\"page\":\"course:cs486_s26\"}"; echo; done
```

Must pass before `systemctl restart`: no Piazza hijack of course-owned logistics
(office hours / grading / TAs / deadlines stay `main`), privacy PASS (no private
thread surfaces), and the content/recency/change cases route to Piazza.

Process (keep the suite honest):
- Every reported failure becomes a `bench/course_e2e.yaml` case BEFORE it is fixed
  (the office-hours, "what changed", and "look at my submission" cases are encoded).
- Periodically fold real `queries.jsonl` course traffic into the suite (`page=course:cs486_s26`),
  deduped and eyeballed.
- `eval.py --section course_e2e` is the gate; the `bench/piazza.yaml` component
  suites (merge/selector/recall/answer/privacy) localize WHERE a regression is.

## Notes

- The first `/ask` after a restart downloads/loads the PAW base model (a few
  seconds); subsequent calls are fast. `PAW_CACHE_DIR` keeps the model across restarts.
- Feedback is appended as JSON lines to `HELPER_FEEDBACK_LOG`. Read it with
  `cat /var/lib/yuntiandeng-helper/feedback.jsonl`.
- Every question is appended to `HELPER_QUERY_LOG` (`/var/lib/yuntiandeng-helper/queries.jsonl`):
  one JSON line per `/ask` with the query, the client `page` key, the request
  `origin` (which site embedded the widget, e.g. `https://neural-os.com`), route,
  result type, answer, validator verdict, and a `fallback` flag (no IP is stored).
  Feedback records also carry `origin`. Since one backend now serves multiple
  sites, `origin` lets you polish each site's helper from its own real traffic.
  Review it with:
  ```bash
  # on the server
  /opt/yuntiandeng-helper/venv/bin/python /opt/yuntiandeng-helper/repo/helper/review.py
  # or pull the logs locally
  scp root@programasweights.com:/var/lib/yuntiandeng-helper/queries.jsonl /tmp/
  python helper/review.py /tmp/queries.jsonl
  ```
  `review.py` highlights the fallback/unanswered queries - those are the gaps to
  fix in `facts.md` / `links.yaml` / the specs, then recompile.
- CORS origins are set via `HELPER_ALLOWED_ORIGINS` in the systemd drop-in.
- For Yuntian's shared helper backend, `PAW_HELPER_INFERENCE_BACKEND=remote_infer`
  sends pinned program IDs through the central PAW `/api/v1/infer` endpoint instead
  of loading/running every helper program in this helper service process.
- Before deploying, prove behavior is unchanged with the golden snapshot:
  `python helper/snapshot.py --check` (empty diff = no response changed).
