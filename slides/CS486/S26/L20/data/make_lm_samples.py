"""Precompute language-model samples for the L20 demos.

Runs the same small model the in-browser demo uses (distilgpt2) and writes a
small JSON with (1) tokenizations, (2) top-k next-token distributions for a few
prompts, and (3) teacher-forcing per-token cross-entropy losses for a sentence.
The demos read this so they still teach in the offline / PDF build.

Run:  python make_lm_samples.py
"""
import json
import math
import os

import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "distilgpt2"
OUT = os.path.join(os.path.dirname(__file__), "lm_samples.json")

TOKENIZE = [
    "unbelievable",
    "The robot picked up the cup.",
    "CS486 tokenization isn't trivial",
    "transformers",
]
PROMPTS = [
    "To be, or not to",
    "The robot picked up the cup because it was",
    "Once upon a time, there was a",
]
LOSS_TEXT = "The robot picked up the cup because it was empty"
TOPK = 10


def piece(tok, tid):
    # human-readable form of a single token; mark a leading space with a dot
    s = tok.decode([tid])
    return s.replace(" ", "\u00b7") if s.startswith(" ") else s


def main():
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(MODEL).eval()

    out = {"model": MODEL, "tokenize": [], "next": [], "loss": {}}

    for text in TOKENIZE:
        ids = tok.encode(text)
        out["tokenize"].append({"text": text, "pieces": [{"piece": piece(tok, i), "id": int(i)} for i in ids]})

    for prompt in PROMPTS:
        ids = tok.encode(prompt)
        with torch.no_grad():
            logits = model(torch.tensor([ids])).logits[0, -1]
        probs = F.softmax(logits, dim=-1)
        top = torch.topk(probs, TOPK)
        out["next"].append({
            "prompt": prompt,
            "top": [{"piece": piece(tok, int(i)), "id": int(i), "p": round(float(p), 5)}
                    for p, i in zip(top.values, top.indices)],
        })

    ids = tok.encode(LOSS_TEXT)
    with torch.no_grad():
        logits = model(torch.tensor([ids])).logits[0]  # (seq, vocab)
    logp = F.log_softmax(logits, dim=-1)
    losses = []
    for t in range(len(ids) - 1):
        losses.append(round(float(-logp[t, ids[t + 1]]), 4))
    out["loss"] = {
        "text": LOSS_TEXT,
        "tokens": [{"piece": piece(tok, i), "id": int(i)} for i in ids],
        "losses": losses,  # losses[t] = -log p(token t+1 | tokens <= t)
    }

    with open(OUT, "w") as f:
        json.dump(out, f)
    print(f"Wrote {OUT}")
    for p in out["next"]:
        print("  " + p["prompt"] + " -> " + ", ".join(f'{t["piece"]}:{t["p"]:.2f}' for t in p["top"][:4]))
    print("  loss avg:", round(sum(out["loss"]["losses"]) / len(out["loss"]["losses"]), 3))


if __name__ == "__main__":
    main()
