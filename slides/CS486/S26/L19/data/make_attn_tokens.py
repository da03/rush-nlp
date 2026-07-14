"""Generate real causal-decoder attention matrices for the L19 demo.

The lecture is decoder-first, so this script extracts attention from the same
small pretrained model dissected later in L21: Qwen3-0.6B. Subword attention is
aligned back to whole words, future mass is audited to be zero, and head labels
describe measured patterns rather than asserting that attention explains the
model.

Run: python make_attn_tokens.py
"""

import json
import os

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


MODEL = "Qwen/Qwen3-0.6B"
SENTENCES = [
    {
        "words": "The robot picked up the cup because it was empty".split(),
        "query": "it",
        "target": "cup",
        "label": "robot / cup",
    },
    {
        "words": "The chef tasted the soup because it was bland".split(),
        "query": "it",
        "target": "soup",
        "label": "chef / soup",
    },
]
OUT = os.path.join(os.path.dirname(__file__), "attn_tokens.json")


def word_attentions(words, tokenizer, model):
    """Return a word-aligned (layer, head, query, key) attention array."""
    encoded = tokenizer(words, is_split_into_words=True, return_tensors="pt")
    with torch.no_grad():
        attention = model(**encoded, output_attentions=True).attentions

    word_ids = encoded.word_ids()
    n_words = len(words)
    groups = [[] for _ in range(n_words)]
    for token_index, word_id in enumerate(word_ids):
        if word_id is not None:
            groups[word_id].append(token_index)

    n_layers = len(attention)
    n_heads = attention[0].shape[1]
    aligned = np.zeros((n_layers, n_heads, n_words, n_words), dtype=np.float32)

    for layer in range(n_layers):
        token_matrix = attention[layer][0].float().numpy()
        for head in range(n_heads):
            matrix = token_matrix[head]
            for query in range(n_words):
                for key in range(n_words):
                    block = matrix[np.ix_(groups[query], groups[key])]
                    aligned[layer, head, query, key] = block.sum(axis=1).mean()
            aligned[layer, head] /= aligned[layer, head].sum(
                axis=1, keepdims=True
            ).clip(min=1e-9)

    return aligned


def maximum_future_mass(matrix):
    """Maximum attention assigned above the causal diagonal."""
    n = matrix.shape[-1]
    return float(max(matrix[i, i + 1 :].sum() for i in range(n)))


def normalized_prefix_entropy(matrix):
    """Average entropy divided by the maximum entropy of each allowed prefix."""
    n = matrix.shape[-1]
    scores = []
    for query in range(2, n):
        probabilities = matrix[query, : query + 1].clip(1e-9)
        entropy = -(probabilities * np.log(probabilities)).sum()
        scores.append(float(entropy / np.log(query + 1)))
    return float(np.mean(scores))


def curate(words, attention, query_word, target_word):
    """Choose literal, auditable patterns from the real decoder."""
    n_layers, n_heads, n_words, _ = attention.shape
    query = words.index(query_word)
    target = words.index(target_word)
    selected = []

    # Head with the largest measured weight from the query to the intended source.
    _, layer, head = max(
        (
            (float(attention[layer, head, query, target]), layer, head)
            for layer in range(n_layers)
            for head in range(n_heads)
        ),
        key=lambda item: item[0],
    )
    selected.append(
        {
            "label": f"L{layer} H{head}: high {query_word} \u2192 {target_word}",
            "layer": int(layer),
            "head": int(head),
            "pattern": "source",
            "A": attention[layer, head].round(4).tolist(),
        }
    )

    # Head whose average attention to the immediately previous token is largest.
    _, layer, head = max(
        (
            (
                float(
                    np.mean(
                        [
                            attention[layer, head, i, i - 1]
                            for i in range(1, n_words)
                        ]
                    )
                ),
                layer,
                head,
            )
            for layer in range(n_layers)
            for head in range(n_heads)
        ),
        key=lambda item: item[0],
    )
    selected.append(
        {
            "label": f"L{layer} H{head}: previous token",
            "layer": int(layer),
            "head": int(head),
            "pattern": "previous",
            "A": attention[layer, head].round(4).tolist(),
        }
    )

    # Head whose rows spread most evenly over each allowed causal prefix.
    _, layer, head = max(
        (
            (normalized_prefix_entropy(attention[layer, head]), layer, head)
            for layer in range(n_layers)
            for head in range(n_heads)
        ),
        key=lambda item: item[0],
    )
    selected.append(
        {
            "label": f"L{layer} H{head}: broad prefix",
            "layer": int(layer),
            "head": int(head),
            "pattern": "broad",
            "A": attention[layer, head].round(4).tolist(),
        }
    )

    for head_data in selected:
        matrix = np.asarray(head_data["A"], dtype=np.float32)
        head_data["max_future_mass"] = round(maximum_future_mass(matrix), 8)
    return selected


def main():
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL,
        dtype=torch.float32,
        attn_implementation="eager",
    ).eval()

    sentences = []
    for item in SENTENCES:
        words = item["words"]
        attention = word_attentions(words, tokenizer, model)
        heads = curate(words, attention, item["query"], item["target"])
        sentences.append(
            {
                "text": " ".join(words),
                "tokens": words,
                "default_query": item["query"],
                "target_source": item["target"],
                "label": item["label"],
                "heads": heads,
            }
        )

    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(
            {"model": MODEL, "causal": True, "sentences": sentences},
            handle,
        )

    print(f"Wrote {OUT}")
    for sentence in sentences:
        print(" ", sentence["text"])
        query_index = sentence["tokens"].index(sentence["default_query"])
        for head_data in sentence["heads"]:
            row = np.asarray(head_data["A"])[query_index]
            top = sorted(
                zip(sentence["tokens"], row), key=lambda pair: -pair[1]
            )[:3]
            print(
                f'    {head_data["label"]:31s} '
                f'{sentence["default_query"]}-> '
                + ", ".join(f"{token}:{weight:.2f}" for token, weight in top)
                + f' | max future mass={head_data["max_future_mass"]:.1e}'
            )


if __name__ == "__main__":
    main()
