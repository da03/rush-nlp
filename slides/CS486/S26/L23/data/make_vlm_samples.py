"""Precompute real VLM traces + CLIP scores for L23.

Prepares three real images (a portrait photo reused from the L1 slides, plus a
generated course-schedule document and a bar chart), runs a genuine
vision-language model (Qwen3-VL-2B-Instruct) on caption / VQA / OCR / chart
prompts, and computes CLIP image-text similarities. The demos read the JSON so
they teach offline / in the PDF build.

Run:  python make_vlm_samples.py   (downloads the VLM the first time)
"""
import json
import os
import shutil

import torch
from PIL import Image, ImageDraw, ImageFont
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(__file__)
IMG = os.path.join(HERE, "..", "images")
OUT = os.path.join(HERE, "vlm_samples.json")
PORTRAIT_SRC = os.path.join(HERE, "..", "..", "L1", "images", "Alan_Turing_Aged_16.jpg")
VLM = "Qwen/Qwen3-VL-2B-Instruct"
CLIP = "openai/clip-vit-base-patch32"


def font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_schedule(path):
    im = Image.new("RGB", (640, 400), "white"); d = ImageDraw.Draw(im)
    d.text((30, 24), "CS 486/686 - Schedule", fill="black", font=font(30))
    d.line((30, 70, 610, 70), fill="black", width=2)
    rows = [
        "Assignment 1 due:  Thursday, June 25",
        "Assignment 2 due:  Thursday, July 16",
        "Assignment 3 due:  Tuesday, August 4",
        "Final exam:        Saturday, August 8",
        "Exam location:     PAC 5",
    ]
    y = 110
    for r in rows:
        d.text((40, y), r, fill="#111111", font=font(24)); y += 52
    im.save(path)


def make_chart(path):
    fig, ax = plt.subplots(figsize=(5, 3.4))
    ax.bar(["A", "B", "C"], [3, 5, 2], color=["#93c5fd", "#1d4ed8", "#93c5fd"])
    ax.set_title("Scores by group"); ax.set_ylabel("score")
    fig.tight_layout(); fig.savefig(path, dpi=110); plt.close(fig)


def run_vlm(items):
    from transformers import Qwen3VLForConditionalGeneration, AutoProcessor
    proc = AutoProcessor.from_pretrained(VLM)
    model = Qwen3VLForConditionalGeneration.from_pretrained(VLM, dtype="auto").eval()
    out = []
    for img_path, task, prompt in items:
        messages = [{"role": "user", "content": [{"type": "image", "image": img_path}, {"type": "text", "text": prompt}]}]
        inputs = proc.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                          return_dict=True, return_tensors="pt")
        with torch.no_grad():
            gen = model.generate(**inputs, max_new_tokens=80, do_sample=False)
        trimmed = gen[0][inputs["input_ids"].shape[1]:]
        text = proc.decode(trimmed, skip_special_tokens=True).strip()
        out.append({"image": os.path.basename(img_path), "task": task, "prompt": prompt, "answer": text})
        print(f"  [{task}] {prompt[:40]} -> {text[:70]}")
    return out


def run_clip(image_paths, labels):
    from transformers import CLIPModel, CLIPProcessor
    model = CLIPModel.from_pretrained(CLIP).eval()
    proc = CLIPProcessor.from_pretrained(CLIP)
    scores = []
    for p in image_paths:
        img = Image.open(p).convert("RGB")
        inp = proc(text=labels, images=img, return_tensors="pt", padding=True)
        with torch.no_grad():
            logits = model(**inp).logits_per_image[0]
        probs = torch.softmax(logits, dim=-1).tolist()
        scores.append({"image": os.path.basename(p), "probs": [round(x, 4) for x in probs]})
        best = labels[int(torch.tensor(probs).argmax())]
        print(f"  CLIP {os.path.basename(p)} -> {best}")
    return {"labels": labels, "scores": scores}


def main():
    os.makedirs(IMG, exist_ok=True)
    shutil.copy(PORTRAIT_SRC, os.path.join(IMG, "portrait.jpg"))
    make_schedule(os.path.join(IMG, "schedule.png"))
    make_chart(os.path.join(IMG, "chart.png"))
    portrait, schedule, chart = (os.path.join(IMG, f) for f in ("portrait.jpg", "schedule.png", "chart.png"))

    tasks = run_vlm([
        (portrait, "caption", "Describe this image in one sentence."),
        (portrait, "vqa", "Is the person wearing a suit? What are they wearing?"),
        (schedule, "ocr", "According to this schedule, when is Assignment 2 due?"),
        (chart, "chart", "Which bar is the largest: A, B, or C?"),
    ])
    clip = run_clip([portrait, schedule, chart],
                    ["a portrait of a person", "a bar chart", "a document with a schedule",
                     "a photo of a landscape", "a screenshot of a phone app"])

    images = []
    for f in ("portrait.jpg", "schedule.png", "chart.png"):
        w, h = Image.open(os.path.join(IMG, f)).size
        images.append({"file": f, "w": w, "h": h})

    with open(OUT, "w") as fh:
        json.dump({"vlm_model": VLM, "clip_model": CLIP, "images": images, "tasks": tasks, "clip": clip}, fh)
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
