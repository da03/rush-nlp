"""Prepare PAW visuals used by Lecture 22.

The paper poster predates the final verified result (73.78%).  This script
keeps the poster figure's design while replacing its rounded 73.4% label with
the final-paper value, 73.8%.  It also exports the last frame of the helper
animation for deterministic PDF rendering.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
L22 = HERE.parent
REPO = L22.parents[3]
OUT_DIR = L22 / "images"
POSTER = Path.home() / "Documents/paw_discrete/poster_assets/fig-03-benchmark.png"
HELPER_GIF = REPO / "paw_helper_tree.gif"


def bold_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def make_benchmark() -> None:
    image = Image.open(POSTER).convert("RGB")
    draw = ImageDraw.Draw(image)
    sx = image.width / 1024
    sy = image.height / 512

    # Preserve the near-white panel background sampled beside the old label.
    background = image.getpixel((round(1000 * sx), round(70 * sy)))
    box = tuple(round(v * s) for v, s in zip((884, 45, 1002, 103), (sx, sy, sx, sy)))
    draw.rounded_rectangle(box, radius=round(8 * sy), fill=background)
    draw.text(
        (round(901 * sx), round(59 * sy)),
        "73.8%",
        font=bold_font(round(27 * sy)),
        fill=(42, 81, 190),
    )

    image.save(OUT_DIR / "paw_benchmark.png", optimize=True)


def make_helper_fallback() -> None:
    image = Image.open(HELPER_GIF)
    image.seek(image.n_frames - 1)
    image.convert("RGB").save(OUT_DIR / "paw_helper_tree_final.png", optimize=True)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_benchmark()
    make_helper_fallback()
    print(f"Wrote PAW assets to {OUT_DIR}")


if __name__ == "__main__":
    main()
