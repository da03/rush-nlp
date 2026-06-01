# "Ask about Yuntian" helper

A small Q&A helper for yuntiandeng.com, built on [ProgramAsWeights](https://programasweights.com).
A site-wide widget sends each query to a server-side pipeline of three precompiled
PAW programs and gets back either a **link** or a **freeform answer**.

```
query ──▶ page_classifier ──▶ a link label? ──▶ return link (cv, contact, neuralos, …)
                           └─▶ "question"   ──▶ answerer ──▶ validator ──▶ answer / fallback
```

## Layout

| Path | What |
|------|------|
| `links.yaml` | Link destinations the classifier can route to (label → url + purpose). |
| `facts.md` | Curated, hand-authored fact sheet that grounds the answerer. **Edit this to change what the helper knows.** |
| `specs/` | The 3 PAW specs. `page_classifier.txt` has a `{{LINKS}}` placeholder; `answerer.txt` has `{{FACTS}}`. |
| `compile.py` | Inlines `links.yaml`/`facts.md` into the specs, compiles them, writes `programs.json`. |
| `programs.json` | Pinned compiled program IDs (committed; the server runs exactly these). |
| `common.py` | Shared spec composition + label normalization (used by server and eval). |
| `server/app.py` | FastAPI service: `POST /ask`, `POST /feedback`, `GET /health`. |
| `bench/` + `eval.py` | Benchmark: auto-graded page routing + manually-graded freeform answers. |
| `deploy/` | systemd unit, nginx vhost, and deploy steps for `helper.yuntiandeng.com`. |

The browser widget is part of the static site, not this dir: `_includes/helper.html`,
`js/helper.js`, `_sass/_helper.scss`, included in `_layouts/default.html`.

## Workflow

```bash
pip install -r server/requirements.txt --extra-index-url https://pypi.programasweights.com/simple/

python compile.py        # compile the 3 programs -> programs.json
python eval.py           # benchmark (writes bench/report.md for manual grading)

# run locally
cd server && uvicorn app:app --port 8088
curl -s localhost:8088/ask -H 'Content-Type: application/json' -d '{"query":"where is your cv"}'
```

To change answers/links: edit `facts.md` or `links.yaml` (and `specs/` if needed),
`python compile.py`, commit `programs.json`, then on the server `git pull` + restart
(see `deploy/README.md`).

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
