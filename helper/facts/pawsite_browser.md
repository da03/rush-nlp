<!-- Browser / JavaScript facts for pawsite_browser_answerer. -->
# ProgramAsWeights in the browser

- The browser/JavaScript SDK package is `@programasweights/web`; install it with `npm install @programasweights/web`.
- Programs compiled with the Compact compiler (`paw-4b-gpt2`) run in the browser via WebAssembly.
- To target the browser, pass `compiler="paw-4b-gpt2"` when compiling.
- The browser SDK resolves slugs through the PAW API, downloads browser assets, then runs inference client-side.
- If you load by program ID, browser inference stays independent of the PAW API at runtime (fully client-side, offline after assets download).
