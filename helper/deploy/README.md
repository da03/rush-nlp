# Deploying the helper service (helper.yuntiandeng.com)

The helper backend runs on the `programasweights.com` server; `helper.yuntiandeng.com`
already points there. The static site (yuntiandeng.com) on GitHub Pages calls it.

## One-time setup on the server

```bash
# 1. Check out the site repo (the server already has GitHub credentials).
sudo mkdir -p /opt/yuntiandeng-helper && cd /opt/yuntiandeng-helper
git clone git@github.com:da03/rush-nlp.git repo
cd repo

# 2. Python venv + deps (PAW package index).
python3 -m venv /opt/yuntiandeng-helper/venv
/opt/yuntiandeng-helper/venv/bin/pip install -r helper/server/requirements.txt \
    --extra-index-url https://pypi.programasweights.com/simple/

# 3. Writable dirs for the model cache and feedback log.
sudo mkdir -p /var/lib/yuntiandeng-helper/paw-cache
sudo touch /var/lib/yuntiandeng-helper/feedback.jsonl
sudo chown -R www-data:www-data /var/lib/yuntiandeng-helper

# 4. Service.
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
curl https://helper.yuntiandeng.com/health
curl -s https://helper.yuntiandeng.com/ask -H 'Content-Type: application/json' \
     -d '{"query":"where is your cv"}'
```

## Updating after a content/spec change

```bash
# On your laptop: edit specs/facts/links, recompile, commit programs.json.
python helper/compile.py
git add helper/ && git commit -m "Update helper" && git push

# On the server:
cd /opt/yuntiandeng-helper/repo && git pull
sudo systemctl restart yuntiandeng-helper
```

`programs.json` is committed, so the server always runs the exact pinned programs
you compiled and tested. No compilation happens on the server.

### Course content changes need no recompile

The course assistant injects facts at inference time from `_data/cs486_s26.yaml`
(rendered by `helper/course_facts.py`), so editing course deadlines, office hours,
TAs, etc. is just:

```bash
# On your laptop: edit _data/cs486_s26.yaml (also updates the course web page), commit, push.
# On the server:
cd /opt/yuntiandeng-helper/repo && git pull
sudo systemctl restart yuntiandeng-helper
```

Recompiling is only needed when a **spec** in `helper/specs/` changes (the model's
behavior), not when course facts change.

## Embedding the widget on other sites (one shared backend)

The backend serves a self-contained widget at `/widget.js`, so any of Yuntian's
sites can embed the helper and talk to this one backend cross-origin.

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

### Changing the CORS allow-list on a live server

The base systemd unit on the server may be hand-tuned (user, cache dir), so the
allow-list is applied as a non-destructive drop-in rather than overwriting the
unit:

```bash
sudo install -d /etc/systemd/system/yuntiandeng-helper.service.d
sudo tee /etc/systemd/system/yuntiandeng-helper.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment=HELPER_ALLOWED_ORIGINS=https://yuntiandeng.com,https://www.yuntiandeng.com,https://neural-os.com,https://www.neural-os.com,https://programasweights.com,https://www.programasweights.com
EOF
sudo systemctl daemon-reload && sudo systemctl restart yuntiandeng-helper
```

Verify: `curl -s -D- -o/dev/null -X POST https://helper.yuntiandeng.com/ask -H 'Origin: https://neural-os.com' -H 'Content-Type: application/json' -d '{"query":"hi"}' | grep -i access-control-allow-origin`

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
  Use this to polish the helper on real usage. Review it with:
  ```bash
  # on the server
  /opt/yuntiandeng-helper/venv/bin/python /opt/yuntiandeng-helper/repo/helper/review.py
  # or pull the logs locally
  scp root@programasweights.com:/var/lib/yuntiandeng-helper/queries.jsonl /tmp/
  python helper/review.py /tmp/queries.jsonl
  ```
  `review.py` highlights the fallback/unanswered queries - those are the gaps to
  fix in `facts.md` / `links.yaml` / the specs, then recompile.
- CORS origins are set via `HELPER_ALLOWED_ORIGINS` in the systemd unit.
- To upgrade to the highest-accuracy compiler later:
  `python helper/compile.py --compiler paw-ft-bs48`, commit, pull, restart.
