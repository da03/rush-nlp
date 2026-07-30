#!/usr/bin/env python3
"""Run a tiny Wan 2.1 text-to-video setup through stable-diffusion.cpp."""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parent
LOCAL_DIR = ROOT / ".local"
SOURCE_DIR = LOCAL_DIR / "stable-diffusion.cpp"
BUILD_DIR = SOURCE_DIR / "build"
DEFAULT_MODEL_DIR = LOCAL_DIR / "models"
DEFAULT_OUTPUT_DIR = ROOT / "outputs"
SD_CPP_REPOSITORY = "https://github.com/leejet/stable-diffusion.cpp.git"
SD_CPP_COMMIT = "e92e86fb11b3028ac9edaf63d93709801d106b12"


@dataclass(frozen=True)
class Artifact:
    filename: str
    url: str
    size: int
    sha256: str | None


ARTIFACTS = (
    Artifact(
        filename="wan2.1_t2v_1.3b-q4_k_m.gguf",
        url=(
            "https://huggingface.co/calcuis/wan-1.3b-gguf/resolve/"
            "0652f175f44055eb60cca26dd7cd89c14abe22ce/"
            "wan2.1_t2v_1.3b-q4_k_m.gguf"
        ),
        size=1_034_031_328,
        sha256="f3c1a3fb984d49d3963cc4a93d4f5103deef5909eb5e948513fb6c6d582a350e",
    ),
    Artifact(
        filename="umt5-xxl-encoder-Q3_K_S.gguf",
        url=(
            "https://huggingface.co/city96/umt5-xxl-encoder-gguf/resolve/"
            "b535255bee98c2b0a59ea7c0ae2dcd0c6657b3b7/"
            "umt5-xxl-encoder-Q3_K_S.gguf"
        ),
        size=2_858_489_696,
        sha256="f64f8d6dc4d8a24276df69d0ccea789aae686f7417950a41e6568c30cb478a5c",
    ),
    Artifact(
        filename="taew2_1.safetensors",
        url=(
            "https://raw.githubusercontent.com/madebyollin/taehv/"
            "0ad83bb8fdc48e9e94138704e939d500a3b43660/"
            "safetensors/taew2_1.safetensors"
        ),
        size=22_642_902,
        sha256="04766eac0221b5390b985ae3fdcca652cbb4b1e8b82b28ea7ff89dfad1b1a93f",
    ),
)

DEFAULT_NEGATIVE_PROMPT = (
    "blurry, low quality, static, text, watermark, distorted, deformed"
)


class WanError(RuntimeError):
    """An actionable setup or generation error."""


def format_bytes(value: int) -> str:
    units = ("B", "KiB", "MiB", "GiB", "TiB")
    amount = float(value)
    for unit in units:
        if amount < 1024 or unit == units[-1]:
            return f"{amount:.1f} {unit}"
        amount /= 1024
    raise AssertionError("unreachable")


def run(command: Sequence[str], *, cwd: Path | None = None) -> None:
    print(f"+ {shlex.join(str(part) for part in command)}", flush=True)
    try:
        subprocess.run(
            [str(part) for part in command],
            cwd=cwd,
            check=True,
        )
    except FileNotFoundError as exc:
        raise WanError(f"Required command not found: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        raise WanError(
            f"Command failed with exit status {exc.returncode}: "
            f"{shlex.join(str(part) for part in command)}"
        ) from exc


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_is_present(artifact: Artifact, destination: Path) -> bool:
    if not destination.is_file():
        return False
    if destination.stat().st_size != artifact.size:
        print(
            f"Size mismatch for {destination.name}; downloading it again.",
            file=sys.stderr,
        )
        destination.unlink()
        return False
    return True


def download_once(artifact: Artifact, destination: Path) -> None:
    partial = destination.with_suffix(destination.suffix + ".part")
    if partial.exists() and partial.stat().st_size > artifact.size:
        partial.unlink()

    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "wan-cpp-runner/1.0"}
    if offset:
        headers["Range"] = f"bytes={offset}-"

    request = urllib.request.Request(artifact.url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        append = offset > 0 and response.status == 206
        if not append:
            offset = 0

        mode = "ab" if append else "wb"
        downloaded = offset
        last_report = 0.0
        with partial.open(mode) as file:
            while True:
                chunk = response.read(8 * 1024 * 1024)
                if not chunk:
                    break
                file.write(chunk)
                downloaded += len(chunk)
                now = time.monotonic()
                if now - last_report >= 1:
                    percent = min(100.0, downloaded * 100 / artifact.size)
                    print(
                        f"\r  {artifact.filename}: {format_bytes(downloaded)} "
                        f"/ {format_bytes(artifact.size)} ({percent:.1f}%)",
                        end="",
                        flush=True,
                    )
                    last_report = now
        print()

    actual_size = partial.stat().st_size
    if actual_size != artifact.size:
        raise WanError(
            f"Incomplete download for {artifact.filename}: expected "
            f"{artifact.size} bytes, received {actual_size}."
        )

    if artifact.sha256:
        print(f"  Verifying {artifact.filename}...", flush=True)
        actual_hash = sha256_file(partial)
        if actual_hash != artifact.sha256:
            partial.unlink()
            raise WanError(
                f"SHA-256 mismatch for {artifact.filename}; the partial file "
                "was removed."
            )

    partial.replace(destination)


def download_artifact(artifact: Artifact, model_dir: Path) -> None:
    destination = model_dir / artifact.filename
    if artifact_is_present(artifact, destination):
        print(f"Found {destination.name} ({format_bytes(artifact.size)})")
        return

    print(f"Downloading {artifact.filename} ({format_bytes(artifact.size)})")
    for attempt in range(1, 4):
        try:
            download_once(artifact, destination)
            return
        except (OSError, urllib.error.URLError, WanError) as exc:
            if attempt == 3:
                raise WanError(
                    f"Could not download {artifact.filename} after 3 attempts: {exc}"
                ) from exc
            print(f"  Download interrupted ({exc}); retrying...", file=sys.stderr)
            time.sleep(attempt * 2)


def check_setup_space(model_dir: Path, *, needs_build: bool) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    missing_bytes = sum(
        artifact.size
        for artifact in ARTIFACTS
        if not artifact_is_present(artifact, model_dir / artifact.filename)
    )
    # Leave room for the source tree, build products, temporary downloads, and output.
    required = missing_bytes + (2 * 1024**3 if needs_build else 0)
    if required == 0:
        return
    free = shutil.disk_usage(LOCAL_DIR).free
    if free < required:
        raise WanError(
            f"Setup needs roughly {format_bytes(required)}, but only "
            f"{format_bytes(free)} is free."
        )


def ensure_source() -> None:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    git_dir = SOURCE_DIR / ".git"

    if SOURCE_DIR.exists() and not git_dir.is_dir():
        raise WanError(
            f"{SOURCE_DIR} exists but is not a managed stable-diffusion.cpp checkout."
        )

    if not SOURCE_DIR.exists():
        SOURCE_DIR.mkdir()
        run(("git", "init"), cwd=SOURCE_DIR)
        run(("git", "remote", "add", "origin", SD_CPP_REPOSITORY), cwd=SOURCE_DIR)

    status = subprocess.run(
        ("git", "status", "--porcelain"),
        cwd=SOURCE_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    if status.stdout.strip():
        raise WanError(
            f"The managed checkout at {SOURCE_DIR} has local changes. "
            "Move or remove them before running setup."
        )

    run(("git", "fetch", "--depth", "1", "origin", SD_CPP_COMMIT), cwd=SOURCE_DIR)
    run(("git", "checkout", "--detach", SD_CPP_COMMIT), cwd=SOURCE_DIR)
    run(
        ("git", "submodule", "update", "--init", "--recursive", "--depth", "1"),
        cwd=SOURCE_DIR,
    )


def sd_binary_path() -> Path:
    candidates = (
        BUILD_DIR / "bin" / "sd-cli",
        BUILD_DIR / "bin" / "Release" / "sd-cli",
        BUILD_DIR / "bin" / "sd-cli.exe",
        BUILD_DIR / "bin" / "Release" / "sd-cli.exe",
    )
    return next((path for path in candidates if path.is_file()), candidates[0])


def build_is_current() -> bool:
    if not sd_binary_path().is_file() or not (SOURCE_DIR / ".git").is_dir():
        return False
    try:
        revision = subprocess.run(
            ("git", "rev-parse", "HEAD"),
            cwd=SOURCE_DIR,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False
    return revision == SD_CPP_COMMIT


def build_sd_cpp() -> None:
    cmake_args = (
        "cmake",
        "-S",
        str(SOURCE_DIR),
        "-B",
        str(BUILD_DIR),
        "-DCMAKE_BUILD_TYPE=Release",
        "-DSD_BUILD_EXAMPLES=ON",
        "-DSD_WEBP=ON",
        "-DSD_WEBM=ON",
    )
    if platform.system() == "Darwin":
        cmake_args += ("-DSD_METAL=ON",)

    run(cmake_args)
    jobs = max(1, min(os.cpu_count() or 1, 8))
    run(
        (
            "cmake",
            "--build",
            str(BUILD_DIR),
            "--config",
            "Release",
            "--target",
            "sd-cli",
            "--parallel",
            str(jobs),
        )
    )
    binary = sd_binary_path()
    if not binary.is_file():
        raise WanError(f"Build completed, but sd-cli was not found under {BUILD_DIR}.")


def setup(model_dir: Path) -> None:
    needs_build = not build_is_current()
    check_setup_space(model_dir, needs_build=needs_build)
    if needs_build:
        print("Preparing stable-diffusion.cpp...")
        ensure_source()
        build_sd_cpp()
    else:
        print(f"Found stable-diffusion.cpp build ({SD_CPP_COMMIT[:7]})")
    model_dir.mkdir(parents=True, exist_ok=True)
    for artifact in ARTIFACTS:
        download_artifact(artifact, model_dir)
    print("\nSetup complete.")


def default_backend() -> str:
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return "metal"
    return "auto"


def validate_generation_args(args: argparse.Namespace) -> None:
    if not args.prompt or not args.prompt.strip():
        raise WanError("Prompt cannot be empty.")
    for name in ("width", "height"):
        value = getattr(args, name)
        if value < 64 or value % 16:
            raise WanError(f"--{name} must be at least 64 and divisible by 16.")
    if args.frames < 1 or (args.frames - 1) % 4:
        raise WanError("--frames must have the form 4n+1 (for example 1, 5, 9, 13).")
    if args.steps < 1:
        raise WanError("--steps must be positive.")
    if args.fps < 1:
        raise WanError("--fps must be positive.")
    if args.cfg_scale < 1:
        raise WanError("--cfg-scale must be at least 1.")


def resolve_output(output: Path | None) -> Path:
    if output is None:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        return DEFAULT_OUTPUT_DIR / f"wan-{timestamp}.webm"
    output = output.expanduser().resolve()
    if not output.suffix:
        output = output.with_suffix(".webm")
    if output.suffix.lower() not in {".webm", ".avi"}:
        raise WanError("--output must use the .webm or .avi extension.")
    return output


def generation_command(
    args: argparse.Namespace,
    binary: Path,
    model_dir: Path,
    output: Path,
) -> list[str]:
    command = [
        str(binary),
        "-M",
        "vid_gen",
        "--diffusion-model",
        str(model_dir / ARTIFACTS[0].filename),
        "--t5xxl",
        str(model_dir / ARTIFACTS[1].filename),
        "--tae",
        str(model_dir / ARTIFACTS[2].filename),
        "--prompt",
        args.prompt.strip(),
        "--cfg-scale",
        str(args.cfg_scale),
        "--sampling-method",
        "euler",
        "--steps",
        str(args.steps),
        "--width",
        str(args.width),
        "--height",
        str(args.height),
        "--video-frames",
        str(args.frames),
        "--fps",
        str(args.fps),
        "--flow-shift",
        "3.0",
        "--seed",
        str(args.seed),
        "--backend",
        args.backend,
        "--diffusion-fa",
        "--output",
        str(output),
    ]
    # A negative condition is only used by classifier-free guidance. Skipping it
    # at CFG 1 avoids an unnecessary second text-encoder pass in the fast preset.
    if args.cfg_scale > 1 and args.negative_prompt:
        command.extend(("--negative-prompt", args.negative_prompt))
    if args.verbose:
        command.append("--verbose")
    return command


def require_runtime(binary: Path, model_dir: Path) -> None:
    missing = [binary, *(model_dir / item.filename for item in ARTIFACTS)]
    missing = [path for path in missing if not path.is_file()]
    if missing:
        formatted = "\n".join(f"  - {path}" for path in missing)
        raise WanError(
            "Setup is incomplete. Run `python3 wan.py --setup` first. "
            f"Missing:\n{formatted}"
        )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a short, low-resolution Wan 2.1 video with "
            "stable-diffusion.cpp."
        )
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="Text describing the video. If omitted, the script asks for it.",
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Build stable-diffusion.cpp and download about 3.7 GiB of weights.",
    )
    parser.add_argument("--steps", type=int, default=12)
    parser.add_argument("--width", type=int, default=384)
    parser.add_argument("--height", type=int, default=224)
    parser.add_argument("--frames", type=int, default=9)
    parser.add_argument("--fps", type=int, default=8)
    parser.add_argument("--cfg-scale", type=float, default=5.0)
    parser.add_argument("--seed", type=int, default=-1)
    parser.add_argument("--backend", default=default_backend())
    parser.add_argument(
        "--negative-prompt",
        default=DEFAULT_NEGATIVE_PROMPT,
        help="Things to discourage in the generated video.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output .webm or .avi path (default: timestamped file in outputs/).",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=DEFAULT_MODEL_DIR,
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--sd-cli",
        type=Path,
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    model_dir = args.model_dir.expanduser().resolve()

    if args.setup:
        setup(model_dir)
        if args.prompt is None:
            print('Try: python3 wan.py "A tiny robot waving at the camera"')
            return 0

    if args.prompt is None:
        if not sys.stdin.isatty():
            raise WanError("Pass a prompt argument when standard input is not a terminal.")
        args.prompt = input("Video prompt: ").strip()

    validate_generation_args(args)
    output = resolve_output(args.output)
    binary = (
        args.sd_cli.expanduser().resolve() if args.sd_cli else sd_binary_path()
    )
    command = generation_command(args, binary, model_dir, output)

    print(f"Output: {output}")
    print(f"Command: {shlex.join(command)}")
    if args.dry_run:
        return 0

    require_runtime(binary, model_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    run(command, cwd=ROOT)
    if not output.is_file():
        raise WanError(f"sd-cli exited successfully but did not create {output}.")
    elapsed = time.monotonic() - started
    print(f"\nCreated {output} in {elapsed:.1f} seconds.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (WanError, KeyboardInterrupt) as error:
        if isinstance(error, KeyboardInterrupt):
            print("\nCancelled.", file=sys.stderr)
        else:
            print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
