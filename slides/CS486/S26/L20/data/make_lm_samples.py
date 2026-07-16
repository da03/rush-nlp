"""Generate audited, offline-safe real-model traces for CS486 L20.

The classroom demos should be instant and reliable, so they visualize
precomputed outputs from Qwen3-0.6B-Base rather than downloading a 0.6B model
in every student's browser. The tokenizer itself remains small enough to load
on demand for custom text.

Outputs:
  * exact Qwen tokenizer pieces and IDs for curated strings;
  * per-token teacher-forcing target probabilities and negative log-likelihood;
  * exact raw next-token probabilities, undisplayed tail mass, and deterministic
    full-vocabulary samples for several prompts.

Run:
    python make_lm_samples.py
"""

from __future__ import annotations

import json
import math
import os
from datetime import date

import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer


MODEL_ID = "Qwen/Qwen3-0.6B-Base"
MODEL_LABEL = "Qwen3-0.6B-Base"
OUT = os.path.join(os.path.dirname(__file__), "lm_samples.json")
TOPK = 8
SAMPLE_SEEDS = (3, 7, 11, 19, 23)

TOKENIZE_TEXTS = [
    "unbelievable",
    "CS486 tokenization isn't trivial",
    "hello",
    " hello",
    "\U0001f916 \u4f60\u597d",
    "for i in range(3): print(i)",
]

LOSS_EXAMPLES = [
    {
        "id": "natural",
        "label": "natural continuation",
        "text": "The robot picked up the cup because it was blue.",
    },
    {
        "id": "surprising",
        "label": "surprising continuation",
        "text": "The robot picked up the cup because it was quantum.",
    },
]

NEXT_PROMPTS = [
    "To be, or not to",
    "The robot picked up the cup because it was",
    "Once upon a time, there was a",
]


def display_piece(tokenizer, token_id: int) -> str:
    """Decode one token and make whitespace visible without changing content."""
    text = tokenizer.decode([token_id], clean_up_tokenization_spaces=False)
    if text.startswith(" "):
        return "\u00b7" + text[1:]
    if text == "\n":
        return "\u21b5"
    return text.replace("\n", "\u21b5")


def token_record(tokenizer, token_id: int) -> dict:
    return {"piece": display_piece(tokenizer, token_id), "id": int(token_id)}


def tokenize_record(tokenizer, text: str) -> dict:
    token_ids = tokenizer.encode(text, add_special_tokens=False)
    return {
        "text": text,
        "characters": len(text),
        "bytes": len(text.encode("utf-8")),
        "token_count": len(token_ids),
        "pieces": [token_record(tokenizer, token_id) for token_id in token_ids],
    }


def loss_record(model, tokenizer, text: str, example_id: str, label: str, device: str) -> dict:
    token_ids = tokenizer.encode(text, add_special_tokens=False)
    inputs = torch.tensor([token_ids], device=device)
    with torch.inference_mode():
        logits = model(inputs).logits[0]
    log_probs = F.log_softmax(logits.float(), dim=-1)
    predictions = []
    losses = []
    for position in range(len(token_ids) - 1):
        target_id = token_ids[position + 1]
        loss = float(-log_probs[position, target_id].cpu())
        probability = math.exp(-loss)
        losses.append(loss)
        predictions.append(
            {
                "position": position,
                "target_index": position + 1,
                "target": token_record(tokenizer, target_id),
                "p": round(probability, 10),
                "loss": round(loss, 6),
            }
        )
    average_loss = sum(losses) / len(losses)
    return {
        "id": example_id,
        "label": label,
        "text": text,
        "tokens": [token_record(tokenizer, token_id) for token_id in token_ids],
        "predictions": predictions,
        "average_loss": round(average_loss, 6),
        "perplexity": round(math.exp(min(average_loss, 20)), 4),
    }


def next_record(model, tokenizer, prompt: str, device: str) -> dict:
    token_ids = tokenizer.encode(prompt, add_special_tokens=False)
    inputs = torch.tensor([token_ids], device=device)
    with torch.inference_mode():
        logits = model(inputs).logits[0, -1].float().cpu()
    probabilities = F.softmax(logits, dim=-1)
    top = torch.topk(probabilities, TOPK)
    top_items = [
        {
            **token_record(tokenizer, int(token_id)),
            "p": round(float(probability), 10),
        }
        for probability, token_id in zip(top.values, top.indices)
    ]

    samples = []
    for seed in SAMPLE_SEEDS:
        generator = torch.Generator(device="cpu").manual_seed(seed)
        sampled_id = int(torch.multinomial(probabilities, 1, generator=generator))
        samples.append(
            {
                "seed": seed,
                **token_record(tokenizer, sampled_id),
                "p": round(float(probabilities[sampled_id]), 10),
            }
        )

    return {
        "prompt": prompt,
        "top": top_items,
        "tail_mass": round(max(0.0, 1.0 - sum(item["p"] for item in top_items)), 10),
        "greedy": top_items[0],
        "samples": samples,
    }


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype="auto",
        low_cpu_mem_usage=True,
    ).to(device).eval()

    output = {
        "schema_version": 2,
        "generated": str(date.today()),
        "model": {
            "id": MODEL_ID,
            "label": MODEL_LABEL,
            "stage": "pretraining",
            "vocab_size": len(tokenizer),
            "device_used_for_generation": device,
        },
        "tokenize": [tokenize_record(tokenizer, text) for text in TOKENIZE_TEXTS],
        "loss": [
            loss_record(model, tokenizer, item["text"], item["id"], item["label"], device)
            for item in LOSS_EXAMPLES
        ],
        "next": [next_record(model, tokenizer, prompt, device) for prompt in NEXT_PROMPTS],
    }

    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {OUT}")
    print(f"Model: {MODEL_LABEL} ({len(tokenizer):,} tokens), device={device}")
    for item in output["loss"]:
        print(
            f'  {item["label"]}: avg NLL={item["average_loss"]:.3f}, '
            f'perplexity={item["perplexity"]:.1f}'
        )
    for item in output["next"]:
        candidates = ", ".join(f'{token["piece"]}:{token["p"]:.3f}' for token in item["top"][:4])
        print(f'  {item["prompt"]!r} -> {candidates}; tail={item["tail_mass"]:.3f}')


if __name__ == "__main__":
    main()
