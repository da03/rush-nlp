<!-- Compile / spec-writing / compiler facts for pawsite_compile_answerer. -->
# Compiling and running ProgramAsWeights programs

## Writing a good spec (best practice)
- Treat spec writing like software engineering: create test cases, measure behavior, inspect specific failures, revise the spec, and retest.
- A good spec states the task, constrains the output format, and includes realistic `Input: ... Output: ...` examples.
- This is also how you evaluate a compiled program: build a small test suite of input/output pairs and check accuracy.

## Compilers
- Standard (`paw-4b-qwen3-0.6b`): the current server default; higher accuracy; about 594 MB base plus about 22 MB per program.
- Compact (`paw-4b-gpt2`): smaller (about 134 MB base plus about 5 MB per program) and runs in the browser via WebAssembly.
- Finetuned Standard (`paw-ft-bs48`): highest accuracy; finetunes a per-spec adapter on top of Standard; takes about 2-5 minutes.
- Recommended workflow: prototype on Standard, then finalize the same spec on Finetuned Standard.

## Runtime
- Each compiled function is stateless: one text input, one text output. There is no conversation, memory, or multiple turns.
- Compilation runs on the hosted PAW API; inference usually runs locally through the SDK.
- A program's spec, input, and output share roughly a 2048-token context window.
- GPU acceleration is automatic (Metal on Mac, CUDA on Linux, CPU fallback). If GPU or Metal errors occur on load, set `PAW_GPU_LAYERS=0` or pass `n_gpu_layers=0` to force CPU.
