"""Regenerate only the chart trace (the 80-token run cut it off) and patch the JSON."""
import json
import os
import torch
from transformers import Qwen3VLForConditionalGeneration, AutoProcessor

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "vlm_samples.json")
IMG = os.path.join(HERE, "..", "images", "chart.png")
VLM = "Qwen/Qwen3-VL-2B-Instruct"
PROMPT = "Which bar is the largest: A, B, or C? Answer in one short sentence."

proc = AutoProcessor.from_pretrained(VLM)
model = Qwen3VLForConditionalGeneration.from_pretrained(VLM, dtype="auto").eval()
messages = [{"role": "user", "content": [{"type": "image", "image": IMG}, {"type": "text", "text": PROMPT}]}]
inputs = proc.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt")
with torch.no_grad():
    gen = model.generate(**inputs, max_new_tokens=128, do_sample=False)
ans = proc.decode(gen[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
print("chart answer:", ans)

d = json.load(open(OUT))
for t in d["tasks"]:
    if t["task"] == "chart":
        t["prompt"] = PROMPT; t["answer"] = ans
json.dump(d, open(OUT, "w"))
print("patched", OUT)
