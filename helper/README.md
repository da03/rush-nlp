# "Ask about Yuntian" helper

A small Q&A helper for yuntiandeng.com, built on [ProgramAsWeights](https://programasweights.com).
A site-wide widget sends each query (plus the **page** it came from) to a server-side
pipeline of precompiled PAW programs and gets back either a **link** or a **freeform answer**.

The pipeline is generic and **config-driven** ([`pipeline.yaml`](pipeline.yaml)). A top-level
**domain router** picks which domain handles the query, using the page as a prior and a
PAW program to catch cross-domain "escapes". Each domain then routes link-vs-question:

```
/ask {query, page}
  ──▶ domain_router (page prior + PAW) ──▶ site  ──▶ page_classifier ──▶ link? ──▶ link result
                                       │                              └─▶ question ──▶ answerer  ─┐
                                       └──▶ course ──▶ course_classifier ──▶ link? ──▶ link result │
                                                                          └─▶ question ──▶ course_answerer ─┤
                                                                                                            └─▶ validator ──▶ answer / fallback
```

Two domains today:
- **site** — questions about Yuntian (research, career, availability). Facts are **baked**
  into the compiled answerer ([`facts.md`](facts.md)); stable, so a change means a recompile.
- **course** — CS 486/686 (Spring 2026). Facts are **injected at inference time** from
  [`_data/cs486_s26.yaml`](../_data/cs486_s26.yaml) via [`course_facts.py`](course_facts.py),
  so a deadline/office-hour change needs only a server `git pull` — no recompile. The same
  injection point is the seam for future RAG (e.g. retrieving Piazza posts).

## Layout

| Path | What |
|------|------|
| `pipeline.yaml` | The pipeline graph: domains, page→domain defaults, router, resilience flags, token budget. |
| `pipeline.py` | The shared executor (used by both server and eval, so they never score differently). |
| `links.yaml` / `course_links.yaml` | Link destinations each classifier can route to (label → url + purpose). |
| `facts.md` | Hand-authored site fact sheet (baked into the site answerer). **Edit to change what the site helper knows.** |
| `course_facts.py` | Renders sliced course facts from `_data/cs486_s26.yaml` (the RAG/context seam). |
| `specs/` | PAW specs: `domain_router`, `page_classifier` (+`{{LINKS}}`), `answerer` (+`{{FACTS}}`/`{{LINK_REGISTRY}}`), `validator`, `course_classifier` (+`{{LINKS}}`), `course_answerer`. |
| `compile.py` | Composes + compiles programs (incremental by default), writes `programs.json`. |
| `programs.json` | Pinned compiled program IDs (committed; the server runs exactly these). |
| `common.py` | Shared spec composition + link loading. |
| `server/app.py` | FastAPI service: `POST /ask` (`{query, page}`), `POST /feedback`, `GET /health`. |
| `bench/` + `eval.py` | Benchmark suites (auto-graded routing/factual + manually-graded freeform). |
| `deploy/` | systemd unit, nginx vhost, and deploy steps for `helper.yuntiandeng.com`. |

The browser widget is part of the static site, not this dir: `_includes/helper.html`
(sends `data-page`), `js/helper.js`, `_sass/_helper.scss`, included in `_layouts/default.html`.
A page opts into a domain by setting `helper_page:` in its front matter (e.g. the course
page sets `helper_page: "course:cs486_s26"`); everything else defaults to `site`.

## Workflow

```bash
pip install -r server/requirements.txt --extra-index-url https://pypi.programasweights.com/simple/

python compile.py                 # compile any programs missing from programs.json
python compile.py --all           # recompile everything
python compile.py --only course_answerer --compiler paw-ft-bs48   # finetune one program
python eval.py                    # all suites (writes bench/report.md for manual grading)
python eval.py --suite domain course_pages course_questions       # a subset

# run locally
cd server && uvicorn app:app --port 8088
curl -s localhost:8088/ask -H 'Content-Type: application/json' \
     -d '{"query":"when is chat 5 due","page":"course:cs486_s26"}'
```

To change answers/links: edit `facts.md` / `links.yaml` (site) or `_data/cs486_s26.yaml`
(course content — no recompile needed) / `course_links.yaml` / the `specs/`, then
`python compile.py` if a spec changed, commit `programs.json`, and on the server
`git pull` + restart (see `deploy/README.md`).

## Evaluation (dataset-first)

Suites live in `bench/` and are the gate for every change:
- `domain.yaml` — `(query, page) → domain`, incl. page-escape cases (auto-graded).
- `pages.yaml` / `course_pages.yaml` — classifier link-vs-question routing (auto-graded).
- `questions.yaml` — site freeform → `bench/report.md` for manual rubric grading.
- `course_questions.yaml` — course freeform: factual cases auto-graded by `expected_any`/
  `expected_all` (substrings cross-checked against `_data/cs486_s26.yaml`); open-ended +
  must-decline cases → `bench/report.md` for manual rubric grading.

`eval.py` also prints a token-budget check and per-node latency, and accepts
`--reconsider` / `--no-backtrack` to ablate the resilience knobs in `pipeline.yaml`.

## Adding a domain

1. Add a `domains.<name>` block to `pipeline.yaml` (classifier, answerer, links, `facts_mode`).
2. Write `specs/<classifier>.txt` and `specs/<answerer>.txt` (+ a links file if it routes).
3. For runtime facts, add a provider to `pipeline.CONTEXT_PROVIDERS`.
4. Map any page(s) to it in `page_defaults` and add escape cases to `bench/domain.yaml`.
5. `python compile.py` then `python eval.py`.

## Benchmark results (default fast compiler `paw-4b-qwen3-0.6b`)

Run `python eval.py` to reproduce. As of the initial build (34 routing cases, 14 freeform):

- **Page classifier:** 65% exact-label, 68% link-vs-question. The fast 0.6B compiler
  over-defers to `question` (several link queries like "show me your papers" or
  "course website" fall through to the answerer). It is also high-variance:
  recompiling the same spec can shift individual decisions.
- **Freeform answerer (manual grade, 13 routed cases):** ~10 correct, 1 acceptable,
  2 wrong, no hallucinations on the pinned program. The two misses were
  "where do you work" (answered with research topics instead of his role) and
  "what's your most famous work" (over-declined). All four "should-decline"
  privacy/off-topic cases declined gracefully.
- **Validator:** lenient on the fast compiler (passed the two weak answers).

### Known fast-compiler ceiling and the upgrade path

A 12-way router plus grounded generation is near the capacity limit of the fast
compiler, so more examples gave diminishing/uneven returns (and one answerer
recompile briefly hallucinated an employer before we reverted). This is the
intended use case for the **finetuned compiler**. When ready:

```bash
python compile.py --compiler paw-ft-bs48   # ~2-5 min/program, drop-in ID swap
python eval.py                             # re-measure
```

`paw-ft-bs48` produces the same runtime shape, so it's a straight `programs.json`
swap — no server or widget changes. Re-grade `bench/report.md` afterward to confirm
the gains before shipping.

### Graceful degradation

Misroutes degrade softly by design: a link query that falls through to `question`
still gets a grounded answer or the "I'm not sure → email / feedback" fallback,
rather than a wrong link. The validator gates obviously-bad freeform answers.
