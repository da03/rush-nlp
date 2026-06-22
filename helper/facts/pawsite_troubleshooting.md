<!-- Troubleshooting facts for pawsite_troubleshooting_answerer. -->
# Troubleshooting ProgramAsWeights

- `RuntimeError: assets not ready`: the program's assets are still generating after compile. The SDK polls automatically for up to 30 seconds; retry shortly if needed.
- HTTP 422 on compile: the spec is likely too short or the request is invalid; adjust the spec.
- HTTP 429 on compile: the hosted compile API rate limit was exceeded; wait, or sign in for higher compile limits.
- GPU or Metal errors on load: set `PAW_GPU_LAYERS=0` or pass `n_gpu_layers=0` to force CPU.
- The first call after install/load is slower because it loads the shared base model; later calls are fast.
