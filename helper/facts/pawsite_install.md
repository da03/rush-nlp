<!-- Install / quickstart facts for pawsite_install_answerer. Runtime-injected. -->
# Installing and using ProgramAsWeights

## Python SDK
- Install with: `pip install programasweights --extra-index-url https://pypi.programasweights.com/simple/`
- There is no separate OS-specific installer; the same pip command works on macOS, Linux, and Windows.
- Quickstart:
  - `import programasweights as paw`
  - `program = paw.compile("Classify sentiment as positive or negative")`
  - `fn = paw.function(program.id)`
  - `fn("I love this!")`
- `paw.compile_and_load(spec)` compiles and loads in one step.

## JavaScript / browser SDK
- Install the browser SDK with `npm install @programasweights/web`.

## CLI
- A CLI is available: `paw compile`, `paw run`, `paw info`, `paw login`.
