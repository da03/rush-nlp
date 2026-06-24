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
ExecStart=
ExecStart=/opt/yuntiandeng-helper/venv/bin/paw-helper serve --host 127.0.0.1 --port 8088
EOF
sudo systemctl daemon-reload && sudo systemctl restart yuntiandeng-helper
```

Verify: `curl -s -D- -o/dev/null -X POST https://helper.yuntiandeng.com/ask -H 'Origin: https://neural-os.com' -H 'Content-Type: application/json' -d '{"query":"hi"}' | grep -i access-control-allow-origin`

## Piazza branch (course page RAG)

On the **course page only**, a parallel branch answers from relevant
**endorsed-public** Piazza threads. It is retrieve -> rerank -> answer:
`piazza.py` (BM25) recalls candidate threads; `piazza_selector` (PAW) is shown the
original question + candidate titles and keeps only the genuinely relevant ones (or
none); `piazza_answerer` (PAW) synthesizes a concise answer from the kept threads'
endorsed instructor replies (or declines). When it answers, the aggregator promotes
it to the primary answer (overriding a generic main answer), with the threads as
citation links. A recency query ("latest posts") returns the most-recent threads
directly. The branch runs concurrently with the main answer (~0 wall time), and the
selector + answerer-decline keep the merge robust to retriever false positives.

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
