"""Precompute traces from the real dissected model (Qwen3-0.6B) for L21.

Writes a small JSON the demos read so they teach offline / in the PDF build:
  - chat-template strings (thinking on/off) for a couple user messages,
  - the tokenized templated prompt (tokens + ids),
  - the last-position next-token top-k distribution,
  - short greedy sample generations,
  - a few curated, token-aligned attention heads on a plain sentence.

Run:  python make_qwen_samples.py   (downloads ~1.2 GB the first time)
"""
import json
import os

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen3-0.6B"
OUT = os.path.join(os.path.dirname(__file__), "qwen_samples.json")

CHAT_USERS = [
    "Explain gradient descent in one sentence.",
    "Who won the 2031 Turing Award?",
]
GEN_MAX = 48
TOPK = 8
ATTN_TEXT = "The robot picked up the cup because it was empty"


def piece(tok, tid):
    s = tok.decode([tid])
    return s.replace(" ", "\u00b7") if s.startswith(" ") else (s if s.strip() else s.replace("\n", "\\n"))


def curate_attention(tok, model):
    ids = tok(ATTN_TEXT, return_tensors="pt").input_ids
    with torch.no_grad():
        att = model(ids, output_attentions=True).attentions  # tuple(L)[1,H,T,T]
    toks = [piece(tok, int(i)) for i in ids[0]]
    n = len(toks)
    L = len(att); H = att[0].shape[1]
    A = np.stack([att[l][0].float().numpy() for l in range(L)])  # (L,H,T,T)
    it = next((i for i, t in enumerate(toks) if t.lstrip("\u00b7").lower() == "it"), n - 1)
    heads = []
    content = [i for i, t in enumerate(toks) if t.lstrip("\u00b7").lower() not in ("the", "it", "was", "because", "up")]
    # coreference-style
    best, bs = None, -1
    for l in range(L):
        for h in range(H):
            j = max(content, key=lambda i: A[l, h, it, i])
            if j != it and A[l, h, it, j] > bs:
                bs, best = A[l, h, it, j], (l, h, j)
    l, h, j = best
    heads.append({"label": f"L{l} H{h}: it \u2192 {toks[j].lstrip(chr(183))}", "layer": int(l), "head": int(h), "A": A[l, h].round(3).tolist()})
    # previous-token
    best, bs = None, -1
    for l in range(L):
        for h in range(H):
            s = np.mean([A[l, h, i, i - 1] for i in range(1, n)])
            if s > bs: bs, best = s, (l, h)
    l, h = best
    heads.append({"label": f"L{l} H{h}: previous token", "layer": int(l), "head": int(h), "A": A[l, h].round(3).tolist()})
    # broad
    def ent(M):
        p = np.clip(M, 1e-9, 1); return float(-(p * np.log(p)).sum(1).mean())
    best, bs = None, -1
    for l in range(L):
        for h in range(H):
            e = ent(A[l, h])
            if e > bs: bs, best = e, (l, h)
    l, h = best
    heads.append({"label": f"L{l} H{h}: broad context", "layer": int(l), "head": int(h), "A": A[l, h].round(3).tolist()})
    return {"text": ATTN_TEXT, "tokens": toks, "heads": heads}


def main():
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype=torch.float32, attn_implementation="eager").eval()

    out = {"model": MODEL, "chat": [], "generations": []}

    for user in CHAT_USERS:
        msgs = [{"role": "user", "content": user}]
        think_off = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        think_on = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=True)
        out["chat"].append({"user": user, "think_off": think_off, "think_on": think_on})

    # tokenized templated prompt + next-token trace (first user, thinking off)
    templ = out["chat"][0]["think_off"]
    ids = tok(templ, return_tensors="pt").input_ids
    out["prompt_tokens"] = {"text": templ, "tokens": [{"piece": piece(tok, int(i)), "id": int(i)} for i in ids[0]]}
    with torch.no_grad():
        logits = model(ids).logits[0, -1]
    probs = F.softmax(logits, dim=-1)
    top = torch.topk(probs, TOPK)
    out["next"] = {"prompt": CHAT_USERS[0], "top": [{"piece": piece(tok, int(i)), "id": int(i), "p": round(float(p), 5)} for p, i in zip(top.values, top.indices)]}

    # short greedy generations
    for user in CHAT_USERS:
        msgs = [{"role": "user", "content": user}]
        enc = tok.apply_chat_template(msgs, add_generation_prompt=True, enable_thinking=False, return_tensors="pt")
        with torch.no_grad():
            gen = model.generate(enc, max_new_tokens=GEN_MAX, do_sample=False)
        text = tok.decode(gen[0][enc.shape[1]:], skip_special_tokens=True)
        out["generations"].append({"prompt": user, "thinking": False, "text": text})

    out["attention"] = curate_attention(tok, model)

    with open(OUT, "w") as f:
        json.dump(out, f)
    print("Wrote", OUT)
    print("next:", CHAT_USERS[0], "->", ", ".join(f'{t["piece"]}:{t["p"]:.2f}' for t in out["next"]["top"][:4]))
    for g in out["generations"]:
        print("gen:", g["prompt"], "->", g["text"][:80].replace("\n", " "))
    for h in out["attention"]["heads"]:
        print("attn:", h["label"])


if __name__ == "__main__":
    main()
