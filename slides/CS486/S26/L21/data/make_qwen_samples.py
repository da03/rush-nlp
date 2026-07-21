"""Generate audited, offline-safe traces for CS486 L21.

The deck dissects the post-trained Qwen3-0.6B assistant. Default interactions
use exact precomputed model outputs so the lecture does not depend on a large
browser download; the optional live path uses the same model and settings.

Run:
    python make_qwen_samples.py
"""

from __future__ import annotations

import json
import os
from datetime import date

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer


MODEL_ID = "Qwen/Qwen3-0.6B"
BASE_MODEL_ID = "Qwen/Qwen3-0.6B-Base"
OUT = os.path.join(os.path.dirname(__file__), "qwen_samples.json")
TOPK = 8
TRACE_STEPS = 32
ATTN_TEXT = "The robot picked up the cup because it was empty"
ATTN_TEXT_B = "The farmers loaded the truck because it was empty"

PROMPTS = {
    "explain": "Explain gradient descent in one sentence.",
    "child": "Explain gradient descent to a 10-year-old in one sentence.",
    "decode": "Explain gradient descent in one sentence.",
    "reason": "Which is larger, 9.11 or 9.9? Explain briefly.",
    "future": "Who won the 2031 Turing Award?",
    "contrast": "What is gradient descent?",
    "multi_user": "Explain gradient descent in one sentence.",
    "multi_assistant": "It iteratively steps the parameters downhill along the negative gradient.",
    "multi_followup": "Now give a one-line real-world example.",
    "gsm8k": (
        "Natalia sold clips to 48 of her friends in April, and then she sold "
        "half as many clips in May. How many clips did she sell altogether in "
        "April and May?"
    ),
}

DECODE_PRESETS = {
    "greedy": {
        "label": "greedy",
        "thinking": False,
        "do_sample": False,
        "temperature": 1.0,
        "top_k": 0,
        "top_p": 1.0,
        "seed": 0,
    },
    "nonthink": {
        "label": "recommended non-thinking",
        "thinking": False,
        "do_sample": True,
        "temperature": 0.7,
        "top_k": 20,
        "top_p": 0.8,
        "seed": 7,
    },
    "thinking": {
        "label": "recommended thinking",
        "thinking": True,
        "do_sample": True,
        "temperature": 0.6,
        "top_k": 20,
        "top_p": 0.95,
        "seed": 11,
    },
}


def display_piece(tokenizer, token_id: int) -> str:
    text = tokenizer.decode([token_id], clean_up_tokenization_spaces=False)
    if text.startswith(" "):
        return "\u00b7" + text[1:]
    if text == "\n":
        return "\u21b5"
    return text.replace("\n", "\u21b5")


def token_record(tokenizer, token_id: int) -> dict:
    return {"piece": display_piece(tokenizer, token_id), "id": int(token_id)}


def serialize_messages(tokenizer, messages: list[dict], thinking: bool) -> dict:
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=thinking,
    )
    token_ids = tokenizer.encode(text, add_special_tokens=False)
    return {
        "text": text,
        "token_count": len(token_ids),
        "tokens": [token_record(tokenizer, token_id) for token_id in token_ids],
    }


def serialize_record(tokenizer, user: str, thinking: bool) -> dict:
    return serialize_messages(tokenizer, [{"role": "user", "content": user}], thinking)


def raw_distribution(model, tokenizer, token_ids: list[int], device: str) -> tuple[torch.Tensor, dict]:
    inputs = torch.tensor([token_ids], device=device)
    with torch.inference_mode():
        logits = model(inputs).logits[0, -1].float().cpu()
    probabilities = F.softmax(logits, dim=-1)
    values, indices = torch.topk(probabilities, TOPK)
    top = [
        {**token_record(tokenizer, int(token_id)), "p": round(float(probability), 10)}
        for probability, token_id in zip(values, indices)
    ]
    return logits, {
        "top": top,
        "tail_mass": round(max(0.0, 1.0 - sum(item["p"] for item in top)), 10),
    }


def filtered_probabilities(logits: torch.Tensor, preset: dict) -> torch.Tensor:
    if not preset["do_sample"]:
        return F.softmax(logits, dim=-1)
    scores = logits / preset["temperature"]
    if preset["top_k"] > 0:
        threshold = torch.topk(scores, preset["top_k"]).values[-1]
        scores = torch.where(scores < threshold, torch.tensor(float("-inf")), scores)
    probabilities = F.softmax(scores, dim=-1)
    if preset["top_p"] < 1:
        sorted_p, sorted_i = torch.sort(probabilities, descending=True)
        cumulative = torch.cumsum(sorted_p, dim=-1)
        remove = cumulative - sorted_p >= preset["top_p"]
        sorted_p[remove] = 0
        probabilities = torch.zeros_like(probabilities).scatter(0, sorted_i, sorted_p)
        probabilities /= probabilities.sum()
    return probabilities


def generation_trace(model, tokenizer, user: str, preset: dict, device: str) -> dict:
    serialized = serialize_record(tokenizer, user, preset["thinking"])
    token_ids = [item["id"] for item in serialized["tokens"]]
    prompt_length = len(token_ids)
    generator = torch.Generator(device="cpu").manual_seed(preset["seed"])
    steps = []
    for step_index in range(TRACE_STEPS):
        raw_logits, raw = raw_distribution(model, tokenizer, token_ids, device)
        sample_p = filtered_probabilities(raw_logits, preset)
        if preset["do_sample"]:
            chosen_id = int(torch.multinomial(sample_p, 1, generator=generator))
        else:
            chosen_id = int(torch.argmax(raw_logits))
        sample_values, sample_indices = torch.topk(sample_p, min(TOPK, int((sample_p > 0).sum())))
        choice = {
            **token_record(tokenizer, chosen_id),
            "raw_p": round(float(F.softmax(raw_logits, dim=-1)[chosen_id]), 10),
            "sample_p": round(float(sample_p[chosen_id]), 10),
        }
        steps.append(
            {
                "step": step_index + 1,
                **raw,
                "sample_top": [
                    {**token_record(tokenizer, int(token_id)), "p": round(float(probability), 10)}
                    for probability, token_id in zip(sample_values, sample_indices)
                ],
                "kept": int((sample_p > 0).sum()),
                "choice": choice,
            }
        )
        token_ids.append(chosen_id)
        if chosen_id == tokenizer.eos_token_id:
            break
    return {
        "prompt": user,
        "settings": preset,
        "template_token_count": prompt_length,
        "steps": steps,
        "completion": tokenizer.decode(
            token_ids[prompt_length:],
            skip_special_tokens=False,
            clean_up_tokenization_spaces=False,
        ),
    }


def teacher_forced_trace(model, tokenizer, user: str, preset: dict, device: str, max_new_tokens: int, steps_cap: int) -> dict:
    """Generate the full clean answer with model.generate, then step through the
    exact produced tokens showing the real distribution at each position. This
    keeps the stepped trace and the full completion perfectly consistent (used
    for sampled generations where a raw multinomial replay would diverge)."""
    serialized = serialize_record(tokenizer, user, preset["thinking"])
    prompt_ids = [item["id"] for item in serialized["tokens"]]
    inputs = torch.tensor([prompt_ids], device=device)
    if device == "mps":
        torch.mps.manual_seed(preset["seed"])
    torch.manual_seed(preset["seed"])
    kwargs = {"max_new_tokens": max_new_tokens, "do_sample": preset["do_sample"], "pad_token_id": tokenizer.eos_token_id}
    if preset["do_sample"]:
        kwargs.update(temperature=preset["temperature"], top_k=preset["top_k"], top_p=preset["top_p"])
    with torch.inference_mode():
        generated = model.generate(inputs, **kwargs)
    new_ids = generated[0, inputs.shape[1]:].tolist()

    steps = []
    token_ids = list(prompt_ids)
    for step_index, chosen_id in enumerate(new_ids[:steps_cap]):
        raw_logits, raw = raw_distribution(model, tokenizer, token_ids, device)
        choice = {
            **token_record(tokenizer, chosen_id),
            "raw_p": round(float(F.softmax(raw_logits, dim=-1)[chosen_id]), 10),
        }
        steps.append({"step": step_index + 1, **raw, "choice": choice})
        token_ids.append(chosen_id)
        if chosen_id == tokenizer.eos_token_id:
            break
    return {
        "prompt": user,
        "settings": preset,
        "template_token_count": len(prompt_ids),
        "steps": steps,
        "completion": tokenizer.decode(new_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False),
    }


def generation_output(model, tokenizer, user: str, preset: dict, device: str, max_new_tokens: int) -> dict:
    serialized = serialize_record(tokenizer, user, preset["thinking"])
    inputs = torch.tensor([[item["id"] for item in serialized["tokens"]]], device=device)
    if device == "mps":
        torch.mps.manual_seed(preset["seed"])
    torch.manual_seed(preset["seed"])
    kwargs = {
        "max_new_tokens": max_new_tokens,
        "do_sample": preset["do_sample"],
        "pad_token_id": tokenizer.eos_token_id,
    }
    if preset["do_sample"]:
        kwargs.update(
            temperature=preset["temperature"],
            top_k=preset["top_k"],
            top_p=preset["top_p"],
        )
    with torch.inference_mode():
        generated = model.generate(inputs, **kwargs)
    output_ids = generated[0, inputs.shape[1]:].tolist()
    return {
        "prompt": user,
        "thinking": preset["thinking"],
        "settings": preset,
        "raw": tokenizer.decode(output_ids, skip_special_tokens=False, clean_up_tokenization_spaces=False),
        "text": tokenizer.decode(output_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False),
        "token_count": len(output_ids),
    }


def attention_for(tokenizer, model, text: str, device: str):
    ids = tokenizer(text, return_tensors="pt").input_ids.to(device)
    with torch.inference_mode():
        attention = model(ids, output_attentions=True).attentions
    tokens = [display_piece(tokenizer, int(token_id)) for token_id in ids[0]]
    matrices = np.stack([attention[layer][0].float().cpu().numpy() for layer in range(len(attention))])
    return tokens, matrices


def query_index(tokens: list[str], word: str) -> int:
    return next(
        (index for index, token in enumerate(tokens) if token.lstrip("\u00b7").lower() == word),
        len(tokens) - 1,
    )


def sentence_payload(tokens, matrices, heads):
    it_index = query_index(tokens, "it")
    return {
        "tokens": tokens,
        "query_default": it_index,
        "heads": [
            {**meta, "A": matrices[meta["layer"], meta["head"]].round(4).tolist()}
            for meta in heads
        ],
    }


def curate_attention(tokenizer, model, device: str) -> dict:
    """Two heads disagree about the ambiguous 'it', then we check them on a
    grammatically unambiguous control sentence."""
    tokens, matrices = attention_for(tokenizer, model, ATTN_TEXT, device)
    layers, heads = matrices.shape[0], matrices.shape[1]
    it_index = query_index(tokens, "it")
    cup_index = query_index(tokens, "cup")
    robot_index = query_index(tokens, "robot")

    def best_head_for(target_index):
        return max(
            (
                (matrices[layer, head, it_index, target_index], layer, head)
                for layer in range(layers)
                for head in range(heads)
            ),
            key=lambda item: item[0],
        )

    cup_weight, cup_layer, cup_head = best_head_for(cup_index)
    robot_weight, robot_layer, robot_head = best_head_for(robot_index)

    head_meta = [
        {
            "label": "head A: it \u2192 cup",
            "criterion": f"strongest it\u2192cup on the ambiguous sentence ({cup_weight:.2f})",
            "layer": int(cup_layer),
            "head": int(cup_head),
        },
        {
            "label": "head B: it \u2192 robot",
            "criterion": f"strongest it\u2192robot on the ambiguous sentence ({robot_weight:.2f})",
            "layer": int(robot_layer),
            "head": int(robot_head),
        },
    ]

    tokens_b, matrices_b = attention_for(tokenizer, model, ATTN_TEXT_B, device)

    max_future_mass = max(
        float(np.triu(matrices[layer, head], 1).sum(axis=1).max())
        for layer in range(layers)
        for head in range(heads)
    )
    max_row_error = max(
        float(np.abs(matrices[layer, head].sum(axis=1) - 1).max())
        for layer in range(layers)
        for head in range(heads)
    )
    return {
        "sentences": [
            {"text": ATTN_TEXT, "kind": "ambiguous", **sentence_payload(tokens, matrices, head_meta)},
            {"text": ATTN_TEXT_B, "kind": "control", **sentence_payload(tokens_b, matrices_b, head_meta)},
        ],
        "audit": {
            "max_future_mass": max_future_mass,
            "max_row_sum_error": max_row_error,
        },
    }


def base_continuation(base_model, tokenizer, prompt: str, device: str, max_new_tokens: int) -> str:
    ids = tokenizer(prompt, return_tensors="pt").input_ids.to(device)
    with torch.inference_mode():
        generated = base_model.generate(
            ids, max_new_tokens=max_new_tokens, do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    return tokenizer.decode(generated[0, ids.shape[1]:], skip_special_tokens=True, clean_up_tokenization_spaces=False)


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype="auto",
        low_cpu_mem_usage=True,
        attn_implementation="eager",
        local_files_only=True,
    ).to(device).eval()
    config = model.config

    chat = []
    for prompt_id in ("explain", "reason", "future"):
        user = PROMPTS[prompt_id]
        chat.append(
            {
                "id": prompt_id,
                "user": user,
                "messages": [{"role": "user", "content": user}],
                "thinking_off": serialize_record(tokenizer, user, False),
                "thinking_on": serialize_record(tokenizer, user, True),
            }
        )

    multi_messages = [
        {"role": "user", "content": PROMPTS["multi_user"]},
        {"role": "assistant", "content": PROMPTS["multi_assistant"]},
        {"role": "user", "content": PROMPTS["multi_followup"]},
    ]
    chat.append(
        {
            "id": "multi",
            "user": PROMPTS["multi_followup"],
            "messages": multi_messages,
            "thinking_off": serialize_messages(tokenizer, multi_messages, False),
            "thinking_on": serialize_messages(tokenizer, multi_messages, True),
        }
    )

    prompt_tokens = chat[0]["thinking_off"]
    explain_ids = [item["id"] for item in prompt_tokens["tokens"]]
    _, explain_next = raw_distribution(model, tokenizer, explain_ids, device)

    decode = {
        "prompt": PROMPTS["decode"],
        "traces": {
            preset_id: generation_trace(model, tokenizer, PROMPTS["decode"], preset, device)
            for preset_id, preset in DECODE_PRESETS.items()
        },
    }

    gsm8k = {
        "prompt": PROMPTS["gsm8k"],
        "trace": generation_trace(model, tokenizer, PROMPTS["gsm8k"], DECODE_PRESETS["greedy"], device),
        "output": generation_output(model, tokenizer, PROMPTS["gsm8k"], DECODE_PRESETS["greedy"], device, 384),
    }

    # Sampling (not greedy) so the fabricated name stays fluent instead of
    # collapsing into a repeated token; seed 21 gives a clean invented name.
    # Teacher-force the exact generated tokens so stepping matches the answer.
    future_preset = {**DECODE_PRESETS["nonthink"], "seed": 21}
    future_trace = teacher_forced_trace(model, tokenizer, PROMPTS["future"], future_preset, device, 96, TRACE_STEPS)

    outputs = [
        {
            "id": "explain",
            **generation_output(model, tokenizer, PROMPTS["explain"], DECODE_PRESETS["greedy"], device, 96),
        },
        {
            "id": "child",
            **generation_output(model, tokenizer, PROMPTS["child"], DECODE_PRESETS["greedy"], device, 96),
        },
        {
            "id": "reason_off",
            **generation_output(model, tokenizer, PROMPTS["reason"], DECODE_PRESETS["nonthink"], device, 96),
        },
        {
            "id": "reason_on",
            **generation_output(model, tokenizer, PROMPTS["reason"], DECODE_PRESETS["thinking"], device, 160),
        },
        {
            "id": "future",
            **generation_output(model, tokenizer, PROMPTS["future"], DECODE_PRESETS["greedy"], device, 96),
        },
    ]

    attention = curate_attention(tokenizer, model, device)
    main_trace = generation_trace(model, tokenizer, PROMPTS["explain"], DECODE_PRESETS["greedy"], device)
    contrast_answer = generation_output(model, tokenizer, PROMPTS["contrast"], DECODE_PRESETS["greedy"], device, 60)

    # Base model (pretraining only) vs post-trained assistant on the same prompt.
    del model
    if device == "mps":
        torch.mps.empty_cache()
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        torch_dtype="auto",
        low_cpu_mem_usage=True,
        local_files_only=True,
    ).to(device).eval()
    contrast = {
        "prompt": PROMPTS["contrast"],
        "base_continuation": base_continuation(base_model, tokenizer, PROMPTS["contrast"], device, 40),
        "assistant_answer": contrast_answer["text"],
    }
    del base_model

    output = {
        "schema_version": 3,
        "generated": str(date.today()),
        "model": {
            "id": MODEL_ID,
            "label": "Qwen3-0.6B",
            "stage": "pretraining + post-training",
            "config": {
                "vocab_size": int(config.vocab_size),
                "hidden_size": int(config.hidden_size),
                "intermediate_size": int(config.intermediate_size),
                "num_hidden_layers": int(config.num_hidden_layers),
                "num_attention_heads": int(config.num_attention_heads),
                "num_key_value_heads": int(config.num_key_value_heads),
                "head_dim": int(config.head_dim),
                "context_length": 32768,
                "rms_norm_eps": float(config.rms_norm_eps),
                "hidden_act": config.hidden_act,
                "tie_word_embeddings": bool(config.tie_word_embeddings),
            },
        },
        "chat": chat,
        "prompt_tokens": prompt_tokens,
        "next": {"prompt": PROMPTS["explain"], **explain_next},
        "main_trace": main_trace,
        "decode": decode,
        "gsm8k": gsm8k,
        "future_trace": future_trace,
        "contrast": contrast,
        "outputs": outputs,
        "attention": attention,
    }

    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {OUT}")
    print("next:", ", ".join(f"{item['piece']}:{item['p']:.3f}" for item in output["next"]["top"][:4]))
    for preset_id, trace in output["decode"]["traces"].items():
        print("trace", preset_id, "->", trace["completion"].replace("\n", "\u21b5"))
    for item in outputs:
        print("output", item["id"], "->", item["text"][:100].replace("\n", " "))
    print("gsm8k ->", gsm8k["output"]["text"][:120].replace("\n", " "))
    print("base   ->", contrast["base_continuation"][:120].replace("\n", " "))
    print("assist ->", contrast["assistant_answer"][:120].replace("\n", " "))
    print("attention audit:", output["attention"]["audit"])


if __name__ == "__main__":
    main()
