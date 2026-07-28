"""Compatibility wrapper for the lecture-parameterized slide QA utility."""

from pathlib import Path
import runpy
import sys


if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.argv.append("L22")
    utility = Path(__file__).resolve().parents[2] / "shared" / "qa_slides.py"
    runpy.run_path(str(utility), run_name="__main__")
