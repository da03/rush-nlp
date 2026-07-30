# Tiny Wan video generation

`wan.py` wraps
[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) and runs
the 1.3B-parameter Wan2.1 text-to-video model locally. The defaults deliberately
trade quality for speed: 384×224, 9 frames, and 12 Euler steps.

This setup is tuned for an Apple-silicon Mac. It uses Metal for inference, a
Q4 diffusion-model quantization, a Q3 text encoder, and the 22 MB TAEHV decoder.
Python packages are not required.

## First run

From this directory:

```bash
python3 wan.py --setup
python3 wan.py "A tiny red robot waves at the camera"
```

Setup compiles a pinned stable-diffusion.cpp revision and downloads about
3.7 GiB of model files. Generated videos are written to `outputs/` as WebM
files.

If no prompt argument is supplied, the script prompts interactively:

```bash
python3 wan.py
```

## Options

Choose an output name or reproduce a result with a fixed seed:

```bash
python3 wan.py "Clouds moving over a mountain" \
  --output mountain.webm --seed 42
```

The defaults make a roughly one-second video. On the tested M3 Mac they took
about 85 seconds and produced a recognizable result. For the absolute fastest
preview, at a significant quality cost, use:

```bash
python3 wan.py "A paper boat floating down a stream" \
  --width 256 --height 144 --steps 4 --cfg-scale 1
```

Width and height must be divisible by 16. Frame counts must be `4n+1`, such as
9, 17, or 33. Higher resolution, frame count, sampling steps, and CFG all add
substantial runtime. CFG above 1 can roughly double sampling work.

Use `--dry-run` to print the underlying `sd-cli` command without executing it.
If Metal is unavailable, `--backend cpu` is a compatible but much slower
fallback.

Runtime varies with temperature and hardware: local video diffusion is
compute-heavy even with these intentionally small settings. The Q4 model and
tiny decoder also reduce visual quality.
