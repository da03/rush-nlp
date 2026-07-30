#!/usr/bin/env python3
"""Build the deterministic visual assets used by CS486 Lecture 24.

The inexpensive path creates the fixed-noise flow-matching illustration.  The
``--generate-wan`` path additionally runs the official Wan2.1-T2V-1.3B
Diffusers checkpoint and records enough metadata to reproduce the clip.

Examples:
    python make_wan_samples.py
    python make_wan_samples.py --generate-wan --output-root /tmp/l24-wan
    python make_wan_samples.py --postprocess-video path/to/wan-output.mp4
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import numpy as np
from PIL import Image, ImageDraw


MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
MODEL_SOURCE = "https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
MARKUP_SOURCE = "https://raw.githubusercontent.com/da03/markup2im/main/imgs/433d71b530.png"
PROMPT = (
    "A small blue robot writes E = mc^2 on a blackboard in a sunlit "
    "university classroom, then turns toward the camera and waves, fixed "
    "camera, coherent motion, clean cinematic lighting"
)
NEGATIVE_PROMPT = (
    "bright colors, overexposed, static, blurred details, subtitles, "
    "watermark, text artifacts, deformed hands, extra limbs, camera shake"
)

SEED = 486
WIDTH = 832
HEIGHT = 480
NUM_FRAMES = 81
FPS = 16
NUM_INFERENCE_STEPS = 30
GUIDANCE_SCALE = 5.0
FLOW_SHIFT = 3.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def output_dirs(root: Path) -> tuple[Path, Path, Path]:
    images = root / "images"
    media = root / "media"
    data = root / "data"
    for directory in (images, media, data):
        directory.mkdir(parents=True, exist_ok=True)
    return images, media, data


def fetch_markup_equation(path: Path) -> None:
    if path.exists():
        return
    with urlopen(MARKUP_SOURCE, timeout=30) as response:
        path.write_bytes(response.read())


def make_flow_assets(root: Path) -> dict[str, Any]:
    """Create fixed endpoints and a print-safe strip for the flow demo.

    This is deliberately a pixel-space visualization of the interpolation
    rule.  Wan applies the same rule to compressed video latents.
    """

    images, _, data = output_dirs(root)
    source = images / "markup2im-equation.png"
    fetch_markup_equation(source)

    clean_source = Image.open(source).convert("RGB")
    target = Image.new("RGB", (960, 320), "white")
    scale = min(880 / clean_source.width, 210 / clean_source.height)
    resized = clean_source.resize(
        (round(clean_source.width * scale), round(clean_source.height * scale)),
        Image.Resampling.LANCZOS,
    )
    target.paste(
        resized,
        ((target.width - resized.width) // 2, (target.height - resized.height) // 2),
    )

    clean = np.asarray(target, dtype=np.float32) / 127.5 - 1.0
    rng = np.random.default_rng(SEED)
    noise = np.clip(rng.normal(0.0, 0.78, clean.shape), -1.0, 1.0)

    def to_image(array: np.ndarray) -> Image.Image:
        pixels = np.clip((array + 1.0) * 127.5, 0, 255).astype(np.uint8)
        return Image.fromarray(pixels, mode="RGB")

    clean_path = images / "flow-data.png"
    noise_path = images / "flow-noise.png"
    to_image(clean).save(clean_path, optimize=True)
    to_image(noise).save(noise_path, optimize=True)

    times = (0.0, 0.25, 0.5, 0.75, 1.0)
    panels: list[Image.Image] = []
    for t_value in times:
        mixed = (1.0 - t_value) * noise + t_value * clean
        panel = to_image(mixed).resize((288, 96), Image.Resampling.LANCZOS)
        framed = Image.new("RGB", (304, 132), "white")
        framed.paste(panel, (8, 8))
        draw = ImageDraw.Draw(framed)
        draw.text((118, 108), f"t = {t_value:g}", fill=(30, 41, 59))
        panels.append(framed)

    strip = Image.new("RGB", (sum(panel.width for panel in panels), 132), "#eef2ff")
    x_offset = 0
    for panel in panels:
        strip.paste(panel, (x_offset, 0))
        x_offset += panel.width
    strip_path = images / "flow-filmstrip.png"
    strip.save(strip_path, optimize=True)

    manifest = {
        "description": (
            "Fixed pixel-space visualization of z_t=(1-t)z_noise+t z_data. "
            "Wan applies this transport in compressed video-latent space."
        ),
        "seed": SEED,
        "source": MARKUP_SOURCE,
        "files": {
            path.name: {"sha256": sha256(path), "size_bytes": path.stat().st_size}
            for path in (source, clean_path, noise_path, strip_path)
        },
    }
    save_json(data / "flow_assets.json", manifest)
    return manifest


def read_video_frames(video_path: Path) -> list[np.ndarray]:
    import imageio.v2 as imageio

    reader = imageio.get_reader(video_path)
    try:
        frame_count = reader.count_frames()
        indices = np.linspace(0, frame_count - 1, 6, dtype=int)
        return [reader.get_data(int(index)) for index in indices]
    finally:
        reader.close()


def make_video_derivatives(video_path: Path, root: Path) -> dict[str, Any]:
    images, media, _ = output_dirs(root)
    canonical_mp4 = media / "wan-robot-classroom.mp4"
    if video_path.resolve() != canonical_mp4.resolve():
        shutil.copy2(video_path, canonical_mp4)

    frames = read_video_frames(canonical_mp4)
    poster_path = images / "wan-robot-classroom-poster.jpg"
    Image.fromarray(frames[len(frames) // 2]).save(
        poster_path, quality=92, optimize=True
    )

    thumb_width = 256
    thumbs: list[Image.Image] = []
    for frame in frames:
        image = Image.fromarray(frame).convert("RGB")
        thumb_height = round(image.height * thumb_width / image.width)
        thumbs.append(image.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS))
    gutter = 10
    filmstrip = Image.new(
        "RGB",
        (
            thumb_width * 3 + gutter * 4,
            thumbs[0].height * 2 + gutter * 3,
        ),
        "#0f172a",
    )
    for index, thumb in enumerate(thumbs):
        x_pos = gutter + (index % 3) * (thumb_width + gutter)
        y_pos = gutter + (index // 3) * (thumb.height + gutter)
        filmstrip.paste(thumb, (x_pos, y_pos))
    filmstrip_path = images / "wan-robot-classroom-filmstrip.jpg"
    filmstrip.save(filmstrip_path, quality=91, optimize=True)

    webm_path = media / "wan-robot-classroom.webm"
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(canonical_mp4),
                "-an",
                "-c:v",
                "libvpx-vp9",
                "-crf",
                "32",
                "-b:v",
                "0",
                str(webm_path),
            ],
            check=True,
        )

    paths = [canonical_mp4, poster_path, filmstrip_path]
    if webm_path.exists():
        paths.append(webm_path)
    return {
        path.name: {"sha256": sha256(path), "size_bytes": path.stat().st_size}
        for path in paths
    }


def make_vae_roundtrip(
    vae: Any,
    frame: Image.Image | np.ndarray,
    root: Path,
    revision: str,
) -> dict[str, Any]:
    """Encode and decode one real frame with Wan-VAE for a lecture comparison."""

    import torch

    images, _, data = output_dirs(root)
    image = Image.fromarray(frame) if isinstance(frame, np.ndarray) else frame
    image = image.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    source_path = images / "wan-vae-input.png"
    image.save(source_path, optimize=True)

    array = np.asarray(image, dtype=np.float32) / 127.5 - 1.0
    sample = (
        torch.from_numpy(array)
        .permute(2, 0, 1)
        .unsqueeze(0)
        .unsqueeze(2)
        .to(device=vae.device, dtype=vae.dtype)
    )
    with torch.inference_mode():
        latent = vae.encode(sample).latent_dist.mode()
        reconstruction = vae.decode(latent).sample
    output = (
        reconstruction[0, :, 0]
        .float()
        .clamp(-1, 1)
        .add(1)
        .mul(127.5)
        .byte()
        .permute(1, 2, 0)
        .cpu()
        .numpy()
    )
    reconstruction_path = images / "wan-vae-reconstruction.png"
    Image.fromarray(output, mode="RGB").save(reconstruction_path, optimize=True)

    files = {
        path.name: {"sha256": sha256(path), "size_bytes": path.stat().st_size}
        for path in (source_path, reconstruction_path)
    }
    save_json(
        data / "wan_vae_roundtrip.json",
        {
            "description": "One-frame encode/decode through the official Wan-VAE.",
            "model": MODEL_ID,
            "revision": revision,
            "files": files,
        },
    )
    return files


def generate_wan(root: Path, revision: str | None) -> dict[str, Any]:
    import diffusers
    import torch
    import transformers
    from diffusers import WanPipeline
    from diffusers.utils import export_to_video
    from huggingface_hub import model_info

    _, media, data = output_dirs(root)
    resolved_revision = revision or model_info(MODEL_ID).sha
    started = time.perf_counter()

    pipeline = WanPipeline.from_pretrained(
        MODEL_ID,
        revision=resolved_revision,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
    )
    pipeline.to("cuda")
    generator = torch.Generator(device="cuda").manual_seed(SEED)
    frames = pipeline(
        prompt=PROMPT,
        negative_prompt=NEGATIVE_PROMPT,
        width=WIDTH,
        height=HEIGHT,
        num_frames=NUM_FRAMES,
        num_inference_steps=NUM_INFERENCE_STEPS,
        guidance_scale=GUIDANCE_SCALE,
        generator=generator,
    ).frames[0]
    elapsed = time.perf_counter() - started

    vae_roundtrip_files = make_vae_roundtrip(
        pipeline.vae, frames[len(frames) // 2], root, resolved_revision
    )
    raw_path = media / "wan-robot-classroom-raw.mp4"
    export_to_video(frames, str(raw_path), fps=FPS)
    files = make_video_derivatives(raw_path, root)
    raw_path.unlink()

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_ID,
        "model_source": MODEL_SOURCE,
        "revision": resolved_revision,
        "prompt": PROMPT,
        "negative_prompt": NEGATIVE_PROMPT,
        "seed": SEED,
        "width": WIDTH,
        "height": HEIGHT,
        "num_frames": NUM_FRAMES,
        "fps": FPS,
        "duration_seconds": NUM_FRAMES / FPS,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "guidance_scale": GUIDANCE_SCALE,
        "scheduler": type(pipeline.scheduler).__name__,
        "prediction_type": pipeline.scheduler.config.prediction_type,
        "flow_shift": pipeline.scheduler.config.flow_shift,
        "runtime_seconds": round(elapsed, 3),
        "device": torch.cuda.get_device_name(0),
        "dtype": "bfloat16",
        "software": {
            "python": ".".join(map(str, __import__("sys").version_info[:3])),
            "torch": torch.__version__,
            "diffusers": diffusers.__version__,
            "transformers": transformers.__version__,
        },
        "files": files,
        "vae_roundtrip_files": vae_roundtrip_files,
    }
    save_json(data / "wan_samples.json", metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    default_root = Path(__file__).resolve().parent.parent
    parser.add_argument("--output-root", type=Path, default=default_root)
    parser.add_argument("--generate-wan", action="store_true")
    parser.add_argument("--revision")
    parser.add_argument("--postprocess-video", type=Path)
    parser.add_argument("--vae-roundtrip-image", type=Path)
    args = parser.parse_args()

    args.output_root = args.output_root.resolve()
    flow_manifest = make_flow_assets(args.output_root)
    print(f"flow assets: {len(flow_manifest['files'])} files")

    if args.postprocess_video:
        files = make_video_derivatives(args.postprocess_video.resolve(), args.output_root)
        print(f"video derivatives: {len(files)} files")

    if args.vae_roundtrip_image:
        import torch
        from diffusers import AutoencoderKLWan
        from huggingface_hub import model_info

        revision = args.revision or model_info(MODEL_ID).sha
        vae = AutoencoderKLWan.from_pretrained(
            MODEL_ID,
            subfolder="vae",
            revision=revision,
            torch_dtype=torch.bfloat16,
        ).to("cuda")
        files = make_vae_roundtrip(
            vae,
            Image.open(args.vae_roundtrip_image.resolve()),
            args.output_root,
            revision,
        )
        print(f"Wan-VAE round trip: {len(files)} files")

    if args.generate_wan:
        metadata = generate_wan(args.output_root, args.revision)
        print(
            "Wan generation complete:",
            metadata["revision"],
            f"{metadata['runtime_seconds']}s",
        )


if __name__ == "__main__":
    main()
