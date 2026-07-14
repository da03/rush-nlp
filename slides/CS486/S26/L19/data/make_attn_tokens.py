"""Generate REAL attention matrices for the L19 attention demo.

Runs a real transformer (bert-base-uncased) with output_attentions, aligns
sub-word pieces back to whole words, and curates a few interpretable heads per
sentence (a coreference-style head, a local/previous-token head, and a broad
head) so the demo's head selector shows that different heads retrieve different
relations. The shipped weights are exactly softmax(QK^T/sqrt(d)) that the model
computed, so the heatmap is genuine attention, precomputed for offline/PDF use.

Run:  python make_attn_tokens.py
"""
import json
import os

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

MODEL = "bert-base-uncased"

SENTENCES = [
    "The robot picked up the cup because it was empty".split(),
    "The chef tasted the soup because it was bland".split(),
]

OUT = os.path.join(os.path.dirname(__file__), "attn_tokens.json")


def word_attentions(words, tok, model):
    """Return attn[layer][head] as a (n_word x n_word) row-normalized matrix."""
    enc = tok(words, is_split_into_words=True, return_tensors="pt")
    with torch.no_grad():
        att = model(**enc, output_attentions=True).attentions  # tuple(L) of (1, H, T, T)
    word_ids = enc.word_ids()
    nw = len(words)
    # group sub-token indices by word
    groups = [[] for _ in range(nw)]
    for i, wid in enumerate(word_ids):
        if wid is not None:
            groups[wid].append(i)
    L = len(att); H = att[0].shape[1]
    out = np.zeros((L, H, nw, nw))
    for l in range(L):
        A = att[l][0].numpy()  # (H, T, T)
        for h in range(H):
            M = A[h]
            for qi in range(nw):
                for kj in range(nw):
                    # average over query sub-tokens, sum over key sub-tokens
                    block = M[np.ix_(groups[qi], groups[kj])]
                    out[l, h, qi, kj] = block.sum(axis=1).mean()
            # renormalize each query row over words (drops mass on [CLS]/[SEP])
            out[l, h] /= out[l, h].sum(axis=1, keepdims=True).clip(min=1e-9)
    return out


def curate(words, attn):
    """Pick a few interpretable heads. attn: (L,H,nw,nw)."""
    L, H, nw, _ = attn.shape
    it = words.index("it") if "it" in words else nw - 1
    heads = []

    # 1) coreference-style: query 'it' most concentrated on a content word
    content = [i for i, w in enumerate(words) if w.lower() not in
               ("the", "it", "was", "because", "up", "did", "not")]
    best, bs = None, -1
    for l in range(L):
        for h in range(H):
            row = attn[l, h, it]
            j = max(content, key=lambda i: row[i])
            if row[j] > bs and j != it:
                bs, best = row[j], (l, h, j)
    l, h, j = best
    heads.append({"label": f"head: it \u2192 {words[j]}", "layer": l, "head": h,
                  "A": attn[l, h].round(3).tolist()})

    # 2) local / previous-token head: high weight just below the diagonal
    best, bs = None, -1
    for l in range(L):
        for h in range(H):
            s = np.mean([attn[l, h, i, i - 1] for i in range(1, nw)])
            if s > bs:
                bs, best = s, (l, h)
    l, h = best
    heads.append({"label": "head: previous token", "layer": l, "head": h,
                  "A": attn[l, h].round(3).tolist()})

    # 3) broad head: flattest rows (max entropy)
    def ent(M):
        p = M.clip(1e-9); return float(-(p * np.log(p)).sum(axis=1).mean())
    best, bs = None, -1
    for l in range(L):
        for h in range(H):
            e = ent(attn[l, h])
            if e > bs:
                bs, best = e, (l, h)
    l, h = best
    heads.append({"label": "head: broad context", "layer": l, "head": h,
                  "A": attn[l, h].round(3).tolist()})
    return heads


def main():
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL, attn_implementation="eager").eval()
    out = []
    for words in SENTENCES:
        attn = word_attentions(words, tok, model)
        out.append({"text": " ".join(words), "tokens": words, "heads": curate(words, attn)})
    with open(OUT, "w") as f:
        json.dump({"model": MODEL, "sentences": out}, f)
    print(f"Wrote {OUT}")
    for s in out:
        print(" ", s["text"])
        for hd in s["heads"]:
            row = np.array(hd["A"])[s["tokens"].index("it") if "it" in s["tokens"] else -1]
            top = sorted(zip(s["tokens"], row), key=lambda z: -z[1])[:3]
            print(f'    {hd["label"]:24s} (L{hd["layer"]} H{hd["head"]})  it-> ' +
                  ", ".join(f"{t}:{p:.2f}" for t, p in top))


if __name__ == "__main__":
    main()
