#!/usr/bin/env python3
"""Generate the real Qwen3.5 traces and fixed assets used by L23.

The default run downloads Qwen/Qwen3.5-0.8B and CLIP, executes deterministic
VQA/OCR prompts, validates the expected fixed examples, and writes
``vlm_samples.json``. Use ``--assets-only --regenerate-assets`` to rebuild the
slide images without loading either model.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import platform
import random
import resource
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import PIL
import torch
import transformers
import torchvision
import huggingface_hub
from PIL import Image, ImageDraw, ImageFont, ImageOps
from transformers import (
    AutoConfig,
    AutoProcessor,
    CLIPModel,
    Qwen3_5ForConditionalGeneration,
)

HERE = Path(__file__).resolve().parent
LECTURE = HERE.parent
IMAGES = LECTURE / "images"
OUTPUT = HERE / "vlm_samples.json"

QWEN_ID = "Qwen/Qwen3.5-0.8B"
CLIP_ID = "openai/clip-vit-base-patch32"
SEED = 486
MAX_NEW_TOKENS = 96


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--assets-only",
        action="store_true",
        help="Prepare PNG assets, then exit without loading models.",
    )
    parser.add_argument(
        "--regenerate-assets",
        action="store_true",
        help="Overwrite generated PNG assets (otherwise existing assets stay exact).",
    )
    parser.add_argument(
        "--skip-clip",
        action="store_true",
        help="Reuse existing CLIP data instead of loading CLIP.",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "mps", "cuda", "cpu"),
        default="auto",
        help="Device for Qwen inference.",
    )
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_input(path: Path, prompt: str) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    digest.update(b"\0")
    digest.update(prompt.encode("utf-8"))
    return digest.hexdigest()


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
        if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def create_office_hours_assets() -> None:
    """Create the OCR document, controlled degradations, and CLIP examples."""

    IMAGES.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (640, 384), "#f8fafc")
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((22, 20, 618, 364), radius=18, fill="#ffffff", outline="#bfdbfe", width=3)
    draw.rounded_rectangle((22, 20, 618, 112), radius=18, fill="#1e3a8a")
    draw.rectangle((22, 80, 618, 112), fill="#1e3a8a")
    draw.text((48, 39), "CS 486/686", font=font(25, bold=True), fill="#bfdbfe")
    draw.text((48, 70), "ADDITIONAL OFFICE HOURS", font=font(31, bold=True), fill="#ffffff")

    rows = (
        ("WED JUL 29", "3–4 PM", "DC 2633"),
        ("THU JUL 30", "4–5 PM", "CLASSROOM"),
    )
    y = 144
    for index, (day, when, where) in enumerate(rows):
        fill = "#eff6ff" if index == 0 else "#f8fafc"
        outline = "#93c5fd" if index == 0 else "#cbd5e1"
        draw.rounded_rectangle((48, y, 592, y + 78), radius=11, fill=fill, outline=outline, width=2)
        draw.text((68, y + 15), day, font=font(22, bold=True), fill="#1e3a8a")
        draw.text((274, y + 18), when, font=font(20, bold=True), fill="#334155")
        draw.text((432, y + 18), where, font=font(20, bold=True), fill="#0f766e")
        y += 94

    draw.text(
        (48, 341),
        "Bring questions from L19–L23.",
        font=font(16),
        fill="#64748b",
    )

    office = IMAGES / "office-hours.png"
    image.save(office, optimize=True)

    # Original CLIP-style preprocessing: resize and center-crop to a fixed square.
    clip_square = ImageOps.fit(
        image,
        (224, 224),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    clip_square.save(IMAGES / "office-hours-clip224.png", optimize=True)

    # Remove high-frequency text evidence. CSS enlarges this 80x48 source for
    # comparison; processor upsampling cannot recreate the lost characters.
    low = image.resize((80, 48), Image.Resampling.BILINEAR)
    low.save(IMAGES / "office-hours-lowres.png", optimize=True)

    landscape = Image.new("RGB", (640, 384), "#93c5fd")
    landscape_draw = ImageDraw.Draw(landscape)
    landscape_draw.ellipse((505, 36, 585, 116), fill="#fde68a")
    landscape_draw.polygon(
        ((0, 240), (170, 76), (320, 238)),
        fill="#475569",
    )
    landscape_draw.polygon(
        ((205, 240), (405, 102), (640, 242)),
        fill="#64748b",
    )
    landscape_draw.polygon(
        ((105, 139), (170, 76), (233, 145)),
        fill="#f8fafc",
    )
    landscape_draw.polygon(
        ((345, 143), (405, 102), (470, 145)),
        fill="#f8fafc",
    )
    landscape_draw.rectangle((0, 240, 640, 384), fill="#60a5fa")
    landscape_draw.polygon(
        ((0, 300), (170, 236), (320, 301)),
        fill="#3b82f6",
    )
    landscape_draw.polygon(
        ((205, 302), (405, 246), (640, 305)),
        fill="#2563eb",
    )
    landscape.save(IMAGES / "landscape.png", optimize=True)

    diagram = Image.new("RGB", (640, 384), "#f8fafc")
    diagram_draw = ImageDraw.Draw(diagram)
    stages = (
        ((35, 132, 185, 252), "#ede9fe", "#6d28d9", "IMAGE"),
        ((245, 132, 395, 252), "#dbeafe", "#1d4ed8", "ENCODER"),
        ((455, 132, 605, 252), "#dcfce7", "#15803d", "ANSWER"),
    )
    for box, fill, outline, label in stages:
        diagram_draw.rounded_rectangle(box, radius=15, fill=fill, outline=outline, width=4)
        bounds = diagram_draw.textbbox((0, 0), label, font=font(23, bold=True))
        text_width = bounds[2] - bounds[0]
        diagram_draw.text(
            ((box[0] + box[2] - text_width) / 2, 177),
            label,
            font=font(23, bold=True),
            fill=outline,
        )
    for start, end in ((185, 245), (395, 455)):
        diagram_draw.line((start + 12, 192, end - 12, 192), fill="#64748b", width=6)
        diagram_draw.polygon(
            ((end - 12, 180), (end, 192), (end - 12, 204)),
            fill="#64748b",
        )
    diagram_draw.text(
        (160, 50),
        "A FLOW DIAGRAM",
        font=font(29, bold=True),
        fill="#334155",
    )
    diagram.save(IMAGES / "diagram.png", optimize=True)


def choose_device(requested: str) -> str:
    if requested != "auto":
        if requested == "mps" and not torch.backends.mps.is_available():
            raise RuntimeError("MPS was requested but is not available.")
        if requested == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is not available.")
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def peak_rss_mb() -> float:
    value = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    # macOS reports bytes; Linux reports KiB.
    return value / (1024 * 1024) if platform.system() == "Darwin" else value / 1024


def as_int_list(tensor: torch.Tensor) -> list[int]:
    return [int(value) for value in tensor.detach().cpu().reshape(-1).tolist()]


def task_specifications() -> list[dict[str, Any]]:
    return [
        {
            "id": "vqa_portrait",
            "task": "visual_question_answering",
            "image": "portrait.jpg",
            "prompt": (
                "Is the person wearing a suit? Briefly describe what they are wearing. "
                "Answer in one or two sentences."
            ),
            "expected_any": ("suit", "tie"),
        },
        {
            "id": "ocr_office_hours",
            "task": "optical_character_recognition",
            "image": "office-hours.png",
            "prompt": (
                "Read the announcement. Where and when are the Wednesday office hours? "
                "Answer in one sentence."
            ),
            "expected_all": ("DC 2633",),
            "expected_any": ("3–4", "3-4", "3 to 4", "3:00"),
        },
        {
            "id": "ocr_office_hours_lowres",
            "task": "resolution_stress_test",
            "image": "office-hours-lowres.png",
            "prompt": (
                "Read the announcement. Where and when are the Wednesday office hours? "
                "Answer in one sentence. If the text is unreadable, say so."
            ),
        },
        {
            "id": "vqa_chart",
            "task": "chart_question_answering",
            "image": "chart.png",
            "prompt": "Which bar is the largest: A, B, or C? Answer in one short sentence.",
            "expected_any": ("B", "bar B"),
        },
    ]


def architecture_snapshot(config: Any) -> dict[str, Any]:
    text = config.text_config
    vision = config.vision_config
    layer_types = list(text.layer_types)
    return {
        "language": {
            "hidden_size": int(text.hidden_size),
            "num_hidden_layers": int(text.num_hidden_layers),
            "vocab_size": int(text.vocab_size),
            "layer_types": layer_types,
            "linear_attention_layers": layer_types.count("linear_attention"),
            "full_attention_layers": layer_types.count("full_attention"),
            "full_attention_interval": int(text.full_attention_interval),
            "tied_word_embeddings": bool(text.tie_word_embeddings),
        },
        "vision": {
            "depth": int(vision.depth),
            "hidden_size": int(vision.hidden_size),
            "num_heads": int(vision.num_heads),
            "patch_size": int(vision.patch_size),
            "temporal_patch_size": int(vision.temporal_patch_size),
            "spatial_merge_size": int(vision.spatial_merge_size),
            "out_hidden_size": int(vision.out_hidden_size),
        },
        "special_token_ids": {
            "image": int(config.image_token_id),
            "vision_start": int(config.vision_start_token_id),
            "vision_end": int(config.vision_end_token_id),
        },
    }


def move_inputs(inputs: Any, device: str) -> Any:
    return inputs.to(device)


def run_qwen_tasks(device: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    print(f"[qwen] loading {QWEN_ID} on {device}", flush=True)
    started = time.perf_counter()
    config = AutoConfig.from_pretrained(QWEN_ID)
    processor = AutoProcessor.from_pretrained(QWEN_ID)
    dtype = torch.bfloat16 if device in {"mps", "cuda"} else torch.float32
    model = Qwen3_5ForConditionalGeneration.from_pretrained(
        QWEN_ID,
        dtype=dtype,
        low_cpu_mem_usage=True,
    ).to(device)
    model.eval()
    load_seconds = time.perf_counter() - started
    commit = getattr(config, "_commit_hash", None)
    print(f"[qwen] loaded in {load_seconds:.1f}s at revision {commit}", flush=True)

    patch_size = int(config.vision_config.patch_size)
    merge_size = int(config.vision_config.spatial_merge_size)
    image_token_id = int(config.image_token_id)
    records: list[dict[str, Any]] = []

    for specification in task_specifications():
        image_path = IMAGES / specification["image"]
        if not image_path.exists():
            raise FileNotFoundError(image_path)
        with Image.open(image_path) as source:
            original_width, original_height = source.size

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": str(image_path)},
                    {"type": "text", "text": specification["prompt"]},
                ],
            }
        ]
        inputs = processor.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
            enable_thinking=False,
        )
        grid = as_int_list(inputs["image_grid_thw"][0])
        temporal, grid_height, grid_width = grid
        raw_patches = temporal * grid_height * grid_width
        merged_tokens = raw_patches // (merge_size * merge_size)
        input_ids = inputs["input_ids"]
        placeholder_tokens = int((input_ids == image_token_id).sum().item())
        resized_width = grid_width * patch_size
        resized_height = grid_height * patch_size
        prompt_tokens = int(input_ids.shape[-1])

        inputs = move_inputs(inputs, device)
        if device == "cuda":
            torch.cuda.synchronize()
            torch.cuda.reset_peak_memory_stats()
        elif device == "mps":
            torch.mps.synchronize()

        print(
            f"[qwen] {specification['id']}: grid={grid}, "
            f"raw={raw_patches}, merged={merged_tokens}, input={prompt_tokens}",
            flush=True,
        )
        task_started = time.perf_counter()
        with torch.inference_mode():
            generated = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                use_cache=True,
            )
        if device == "cuda":
            torch.cuda.synchronize()
        elif device == "mps":
            torch.mps.synchronize()
        latency = time.perf_counter() - task_started

        generated_only = generated[:, prompt_tokens:]
        answer = processor.batch_decode(
            generated_only,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0].strip()
        generated_tokens = int(generated_only.shape[-1])
        print(f"[qwen] {specification['id']} ({latency:.1f}s): {answer}", flush=True)

        lower_answer = answer.lower()
        expected_all = [value for value in specification.get("expected_all", ())]
        expected_any = [value for value in specification.get("expected_any", ())]
        all_ok = all(value.lower() in lower_answer for value in expected_all)
        any_ok = not expected_any or any(value.lower() in lower_answer for value in expected_any)
        check_passed = all_ok and any_ok
        if (expected_all or expected_any) and not check_passed:
            raise AssertionError(
                f"{specification['id']} failed expected-answer check: {answer!r}"
            )

        device_memory: dict[str, float] = {"process_peak_rss_mb": round(peak_rss_mb(), 1)}
        if device == "cuda":
            device_memory["cuda_peak_allocated_mb"] = round(
                torch.cuda.max_memory_allocated() / 1024**2, 1
            )
        elif device == "mps":
            device_memory["mps_allocated_mb"] = round(
                torch.mps.current_allocated_memory() / 1024**2, 1
            )
            device_memory["mps_driver_allocated_mb"] = round(
                torch.mps.driver_allocated_memory() / 1024**2, 1
            )

        records.append(
            {
                "id": specification["id"],
                "task": specification["task"],
                "image": f"images/{specification['image']}",
                "input_sha256": sha256_input(image_path, specification["prompt"]),
                "prompt": specification["prompt"],
                "answer": answer,
                "trace": {
                    "original_size": {
                        "width": original_width,
                        "height": original_height,
                    },
                    "processor_resized_size": {
                        "width": resized_width,
                        "height": resized_height,
                    },
                    "image_grid_thw": grid,
                    "raw_patch_features": raw_patches,
                    "merged_image_embeddings": merged_tokens,
                    "image_placeholder_tokens": placeholder_tokens,
                    "total_serialized_input_tokens": prompt_tokens,
                    "generated_tokens": generated_tokens,
                },
                "runtime": {
                    "latency_seconds": round(latency, 3),
                    **device_memory,
                },
                "expected_answer_check": {
                    "required_all": expected_all,
                    "required_any": expected_any,
                    "passed": check_passed,
                },
            }
        )

    metadata = {
        "checkpoint": QWEN_ID,
        "checkpoint_revision": commit,
        "load_seconds": round(load_seconds, 3),
        "device": device,
        "dtype": str(dtype).replace("torch.", ""),
        "architecture": architecture_snapshot(config),
    }

    del model, processor
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()
    elif device == "mps":
        torch.mps.empty_cache()
    return metadata, records


def load_previous_clip() -> dict[str, Any]:
    if not OUTPUT.exists():
        raise FileNotFoundError("--skip-clip requires an existing vlm_samples.json")
    previous = json.loads(OUTPUT.read_text())
    clip = previous.get("clip")
    if not clip:
        raise ValueError("Existing vlm_samples.json has no CLIP section.")
    return clip


def compute_clip_matrix() -> dict[str, Any]:
    image_names = ("portrait.jpg", "landscape.png", "chart.png", "diagram.png")
    captions = (
        "a black and white portrait of a person",
        "a mountain landscape reflected in a lake",
        "a bar chart comparing A, B, and C",
        "a flow diagram with connected boxes",
    )
    images = [Image.open(IMAGES / name).convert("RGB") for name in image_names]

    print(f"[clip] loading {CLIP_ID} on cpu", flush=True)
    processor = AutoProcessor.from_pretrained(CLIP_ID)
    model = CLIPModel.from_pretrained(CLIP_ID).eval()
    inputs = processor(
        text=list(captions),
        images=images,
        return_tensors="pt",
        padding=True,
    )
    with torch.inference_mode():
        output = model(**inputs)
        image_features = torch.nn.functional.normalize(output.image_embeds, dim=-1)
        text_features = torch.nn.functional.normalize(output.text_embeds, dim=-1)
        cosine = image_features @ text_features.T
        image_to_text = torch.softmax(output.logits_per_image, dim=-1)
        text_to_image = torch.softmax(output.logits_per_text, dim=-1)

    for image in images:
        image.close()
    result = {
        "checkpoint": CLIP_ID,
        "checkpoint_revision": getattr(model.config, "_commit_hash", None),
        "images": [f"images/{name}" for name in image_names],
        "captions": list(captions),
        "cosine_similarity": np.round(cosine.cpu().numpy(), 6).tolist(),
        "image_to_text_probability": np.round(
            image_to_text.cpu().numpy(), 6
        ).tolist(),
        "text_to_image_probability": np.round(
            text_to_image.cpu().numpy(), 6
        ).tolist(),
    }
    diagonal = np.diag(np.asarray(result["image_to_text_probability"]))
    if not bool(np.all(diagonal > 0.5)):
        raise AssertionError(f"CLIP diagonal check failed: {diagonal.tolist()}")
    print(f"[clip] diagonal probabilities: {diagonal.round(3).tolist()}", flush=True)
    return result


def validate_payload(payload: dict[str, Any]) -> None:
    architecture = payload["model"]["architecture"]
    assert architecture["language"]["hidden_size"] == 1024
    assert architecture["language"]["num_hidden_layers"] == 24
    assert architecture["language"]["linear_attention_layers"] == 18
    assert architecture["language"]["full_attention_layers"] == 6
    assert architecture["language"]["vocab_size"] == 248320
    assert architecture["vision"]["patch_size"] == 16
    assert architecture["vision"]["spatial_merge_size"] == 2
    assert architecture["vision"]["hidden_size"] == 768
    assert architecture["vision"]["out_hidden_size"] == 1024
    assert len(payload["tasks"]) == 4
    assert all(task["answer"] for task in payload["tasks"])
    for task in payload["tasks"]:
        trace = task["trace"]
        assert trace["raw_patch_features"] == (
            math.prod(trace["image_grid_thw"])
        )
        assert trace["merged_image_embeddings"] * 4 == trace["raw_patch_features"]


def main() -> None:
    args = parse_args()
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    generated_assets = (
        IMAGES / "office-hours.png",
        IMAGES / "office-hours-clip224.png",
        IMAGES / "office-hours-lowres.png",
        IMAGES / "landscape.png",
        IMAGES / "diagram.png",
    )
    if args.regenerate_assets or any(not path.exists() for path in generated_assets):
        create_office_hours_assets()
        print("[assets] wrote the deterministic L23 image set", flush=True)
    else:
        print("[assets] using the existing hashed L23 image set", flush=True)
    if args.assets_only:
        return

    device = choose_device(args.device)
    model_metadata, tasks = run_qwen_tasks(device)
    clip = load_previous_clip() if args.skip_clip else compute_clip_matrix()
    payload = {
        "schema_version": 2,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "generator": {
            "script": "data/make_vlm_samples.py",
            "seed": SEED,
            "python": platform.python_version(),
            "torch": torch.__version__,
            "torchvision": torchvision.__version__,
            "transformers": transformers.__version__,
            "huggingface_hub": huggingface_hub.__version__,
            "pillow": PIL.__version__,
            "numpy": np.__version__,
        },
        "model": model_metadata,
        "decoding": {
            "enable_thinking": False,
            "do_sample": False,
            "max_new_tokens": MAX_NEW_TOKENS,
            "use_cache": True,
        },
        "assets": {
            path.name: {
                "size": list(Image.open(path).size),
                "sha256": sha256_file(path),
            }
            for path in (
                IMAGES / "office-hours.png",
                IMAGES / "office-hours-clip224.png",
                IMAGES / "office-hours-lowres.png",
                IMAGES / "portrait.jpg",
                IMAGES / "chart.png",
                IMAGES / "landscape.png",
                IMAGES / "diagram.png",
            )
        },
        "tasks": tasks,
        "clip": clip,
    }
    validate_payload(payload)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"[done] wrote {OUTPUT}", flush=True)


if __name__ == "__main__":
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    main()
