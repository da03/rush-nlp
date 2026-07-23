"""Build a small precomputed RAG index of real CS486 course facts for L22.

Embeds each course "chunk" with the same model the in-browser demo uses
(all-MiniLM-L6-v2, mean-pooled + L2-normalized) so the live query embedding
(Transformers.js) is comparable to these precomputed vectors. Stores the two
current questions used in the lecture as offline/PDF presets.

Run:  python make_rag_chunks.py
"""
import json
import os

import numpy as np
import torch
from transformers import AutoModel, AutoTokenizer

MODEL = "sentence-transformers/all-MiniLM-L6-v2"
OUT = os.path.join(os.path.dirname(__file__), "rag_chunks.json")

CHUNKS = [
    ("schedule", "Assignment 1 is due Thursday, June 25, 2026 at 11:59 PM (extended from June 18)."),
    ("announcement", "Assignment 2 is due Thursday, July 16, 2026 at 11:59 PM, a one-week extension from July 9."),
    ("assignments", "Assignment 3 is released July 9 and is due Tuesday, August 4, 2026 at 11:59 PM."),
    ("schedule", "The final exam is on Saturday, August 8, 2026, from 7:30 PM to 10:00 PM in PAC 5."),
    ("grading", "You must pass the written final exam to pass the course."),
    ("grading", "CS486 grade breakdown: assignments 30%, chat assignments 20% (10 chats at 2% each), final exam 50%, optional project +10% bonus."),
    ("grading", "CS686 grade breakdown: assignments 30%, project 30%, final exam 40%."),
    ("staff", "The instructor for CS486/686 Spring 2026 is Yuntian Deng."),
    ("staff", "Dake Zhang owns Assignment 1 questions and grading, Henry Lin owns Assignment 2, and Yuntian Deng owns Assignment 3."),
    ("policy", "There are 10 chat assignments on the Chrysalis platform, each worth 2% of the grade."),
    ("schedule", "Lecture 18 covers Neural Networks and Learned Embeddings."),
    ("schedule", "Lecture 19 covers Sequence Models, Attention, and Transformers."),
    ("schedule", "Lecture 20 covers Pretraining Language Models From First Principles."),
    ("schedule", "Lecture 21 dissects a small language model, Qwen3-0.6B."),
    ("schedule", "Lecture 22 covers prompting, fine-tuning, and LoRA."),
    ("schedule", "Lecture 23 dissects a vision-language model and Lecture 24 covers diffusion and world models."),
    ("announcement", "Lectures 17 and 18 on July 7 and 9 were asynchronous pre-recorded videos because the instructor was at ICML."),
    ("announcement", "The CS686 project proposal was due Thursday, July 9, 2026, submitted on LEARN."),
    ("readings", "The primary textbook is Artificial Intelligence: Foundations of Computational Agents by Poole and Mackworth, 2nd edition, available online."),
    ("policy", "Class-wide communication happens on the Piazza discussion board; assignments are released and submitted on LEARN."),
]

QUESTIONS = [
    "When is Assignment 3 due?",
    "When and where is the final exam?",
]


def embed(texts, tok, model):
    out = []
    for t in texts:
        enc = tok(t, return_tensors="pt", truncation=True, max_length=128)
        with torch.no_grad():
            hidden = model(**enc).last_hidden_state[0]  # (T, d)
        mask = enc["attention_mask"][0].unsqueeze(-1)
        v = (hidden * mask).sum(0) / mask.sum().clamp(min=1)
        v = v / v.norm().clamp(min=1e-9)
        out.append(v.numpy())
    return np.stack(out)


def main():
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModel.from_pretrained(MODEL).eval()

    cvec = embed([c[1] for c in CHUNKS], tok, model)
    qvec = embed(QUESTIONS, tok, model)

    chunks = [{"id": i, "source": s, "text": t, "vec": [round(float(x), 4) for x in cvec[i]]}
              for i, (s, t) in enumerate(CHUNKS)]
    questions = []
    for qi, q in enumerate(QUESTIONS):
        sims = cvec @ qvec[qi]
        order = np.argsort(-sims)[:2]
        questions.append({"q": q, "ranking": [{"i": int(i), "score": round(float(sims[i]), 4)} for i in order]})

    with open(OUT, "w") as f:
        json.dump({"model": "Xenova/all-MiniLM-L6-v2", "dim": int(cvec.shape[1]), "chunks": chunks, "questions": questions}, f)
    print(f"Wrote {OUT} ({len(chunks)} chunks, {len(questions)} questions)")
    for q in questions:
        top = q["ranking"][0]
        print(f'  "{q["q"]}" -> [{top["score"]:.2f}] {CHUNKS[top["i"]][1][:70]}')


if __name__ == "__main__":
    main()
