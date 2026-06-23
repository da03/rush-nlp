<!--
Detailed facts for the ProgramAsWeights (PAW) sub-answerer. Injected at inference
time (not baked), so this can be edited without recompiling. Keep it factual and
grounded in programasweights.com / its docs. HTML comments are stripped before use.
-->
# ProgramAsWeights (PAW)

## What it is
- ProgramAsWeights (PAW) compiles a short natural-language specification into a tiny neural function - "neural software" - that runs locally.
- Each compiled function is stateless: it takes one text input and returns one text output.
- Core idea: it shifts large language models from problem solvers into tool builders. Instead of calling one giant model on every query, you compile a small, reusable, specialized local model for the task.
- Project site: https://programasweights.com ; documentation: https://programasweights.readthedocs.io
- ProgramAsWeights is led by Yuntian Deng, the principal investigator (PI). The other authors are collaborators and contributors.
- Authors and contributors: Yuntian Deng (PI), Wentao Zhang, Liliana Hotsko, Woojeong Kim, Pengyu Nie, and Stuart Shieber.
- PAW is open source under the MIT License; the source code is on GitHub at https://github.com/programasweights.

## What it is good for
- Fuzzy text tasks that regex can't handle but a full LLM is overkill for: classification, extraction, format repair, fuzzy/typo-tolerant search, log triage, and intent routing.

## How you use it
- Install: `pip install programasweights`.
- Compile a spec into a program: `paw.compile(spec)`; load and run it: `paw.function(program_id)`; or do both with `paw.compile_and_load(spec)`.
- A spec is a short description plus a few `Input: ... Output: ...` examples; iterate on the examples to improve accuracy.
- There is also a CLI (`paw compile`, `paw run`, `paw info`) and a browser/JavaScript SDK (`@programasweights/web`).

## Compilers
- Standard (`paw-4b-qwen3-0.6b`): the default; about 594 MB base model plus ~22 MB per compiled program (a LoRA adapter); compiles in roughly 5-10 seconds.
- Compact (`paw-4b-gpt2`): smaller (~134 MB base + ~5 MB per program) and runs in the browser via WebAssembly.
- Finetuned Standard (`paw-ft-bs48`): highest accuracy; it finetunes a per-spec LoRA on top of the Qwen3-0.6B base, takes about 2-5 minutes, and is a drop-in replacement for Standard.
- Recommended workflow: prototype quickly with the Standard compiler, then finalize the same spec on Finetuned Standard for the best accuracy.

## How it runs
- Compilation runs on the hosted PAW API; inference runs locally through the SDK.
- A program's spec, input, and output share roughly a 2048-token context window.
- GPU acceleration is automatic (Metal on Mac, CUDA on Linux, CPU fallback). The first call takes about 1-5 seconds to load the base model; later calls are typically 0.05-0.5 seconds.
- The base model is shared across programs on disk, and inference works offline after the first download.

## Relation to this site
- This "Ask about Yuntian" helper is itself built with ProgramAsWeights.
