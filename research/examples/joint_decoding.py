"""Independent decisions, higher-order CRFs, and exact path search.

Run with Python 3.9+: python joint_decoding.py
Uses standard-library dynamic programming over small, explicitly listed states.

Yuntian Deng and Alexander M. Rush:
- Cascaded Text Generation with Markov Transformers (NeurIPS 2020),
  https://arxiv.org/abs/2006.01112
- Sequence-to-Lattice Models for Fast Translation (Findings of EMNLP 2021),
  https://aclanthology.org/2021.findings-emnlp.318/
Guide: https://yuntiandeng.com/research/structured-decoding/

The CRF example isolates bounded-context factors and exact decoding. Cascaded
Generation additionally uses increasing orders, max-marginal pruning, and
parallel inference. This script does not implement that cascade or benchmark it.
The second example uses a locally normalized Markov lattice, keeping its
normalization distinct from the globally normalized CRF.
"""

import itertools
import math


def logsumexp(values):
    largest = max(values)
    return largest + math.log(sum(math.exp(v - largest) for v in values))


def local_score(position, token, history, unary, factors, order):
    """A factor key is (ending position, tuple of 2..order+1 token strings)."""
    window = history + (token,)
    score = unary[position][token]
    for width in range(2, min(order + 1, len(window)) + 1):
        score += factors.get((position, window[-width:]), 0.0)
    return score


def validate_model(unary, factors, order):
    if not isinstance(order, int) or order < 0 or not unary or any(not row for row in unary):
        raise ValueError("Use a nonempty candidate set at each position and a nonnegative order.")
    if any(not math.isfinite(v) for row in unary for v in row.values()):
        raise ValueError("This example requires finite unary scores.")
    for (end, span), score in factors.items():
        if len(span) < 2 or len(span) > order + 1 or end < len(span) - 1 or end >= len(unary):
            raise ValueError("A factor must fit within the model's length and order.")
        if not math.isfinite(score):
            raise ValueError("This example requires finite factor scores.")
        if any(token not in unary[end - len(span) + 1 + i] for i, token in enumerate(span)):
            raise ValueError("Every factor token must occur in its position's candidate set.")


def path_score(path, unary, factors, order):
    return sum(local_score(t, token, path[max(0, t - order):t], unary, factors, order)
               for t, token in enumerate(path))


def viterbi(unary, factors=None, order=1):
    """Max-sum DP; retaining the last `order` tokens makes future scores local."""
    factors = {} if factors is None else factors
    validate_model(unary, factors, order)
    chart = {(): (0.0, ())}
    for position, candidates in enumerate(unary):
        following = {}
        for history, (score, path) in chart.items():
            for token in candidates:
                value = score + local_score(position, token, history, unary, factors, order)
                state = (history + (token,))[-order:] if order else ()
                if state not in following or value > following[state][0]:
                    following[state] = (value, path + (token,))
        chart = following
    score, path = max(chart.values(), key=lambda item: item[0])
    return path, score


def log_partition(unary, factors=None, order=1):
    """Sum-product DP in log space; unlike Viterbi, it sums all complete paths."""
    factors = {} if factors is None else factors
    validate_model(unary, factors, order)
    chart = {(): 0.0}
    for position, candidates in enumerate(unary):
        incoming = {}
        for history, prefix_score in chart.items():
            for token in candidates:
                state = (history + (token,))[-order:] if order else ()
                value = prefix_score + local_score(position, token, history, unary, factors, order)
                incoming.setdefault(state, []).append(value)
        chart = {state: logsumexp(values) for state, values in incoming.items()}
    return logsumexp(list(chart.values()))


def enumerate_paths(unary, factors=None, order=1):
    """An independent brute-force reference for small candidate lattices."""
    factors = {} if factors is None else factors
    results = []
    for path in itertools.product(*(row.keys() for row in unary)):
        score = sum(unary[t][token] for t, token in enumerate(path))
        score += sum(value for (end, span), value in factors.items()
                     if path[end - len(span) + 1:end + 1] == span)
        results.append((path, score))
    return results


def agreement_model():
    unary = [dict(zip(("dog", "dogs"), map(math.log, (0.65, 0.35)))),
             dict(zip(("often", "rarely"), map(math.log, (0.7, 0.3)))),
             dict(zip(("runs", "run"), map(math.log, (0.4, 0.6))))]
    bigrams = {(2, ("often", "run")): 0.15}
    trigrams = {(2, (noun, adverb, verb)): 1.0
                for noun, verb in (("dog", "runs"), ("dogs", "run"))
                for adverb in ("often", "rarely")}
    return unary, bigrams, trigrams


def main():
    unary, bigrams, trigrams = agreement_model()
    print("Candidate lattice:", [list(row) for row in unary])
    print("Scores are fixed numbers so every path can be inspected.")
    for name, order, factors in [("Independent", 0, {}), ("First order", 1, bigrams),
                                  ("Second order", 2, {**bigrams, **trigrams})]:
        path, score = viterbi(unary, factors, order)
        log_z = log_partition(unary, factors, order)
        print(f"{name:13s}: {' '.join(path):17s}  score={score:.6f}  "
              f"log Z={log_z:.6f}  normalized p={math.exp(score - log_z):.6f}")
    print("\nThe second-order factor connects the noun and verb across the adverb.")
    print("\nA separate, locally normalized Markov lattice:")
    markov_unary = [{"A": math.log(0.6), "B": math.log(0.4)}, {"x": 0.0, "y": 0.0}]
    transitions = {(1, ("A", "x")): math.log(0.5), (1, ("A", "y")): math.log(0.5),
                   (1, ("B", "x")): math.log(0.9), (1, ("B", "y")): math.log(0.1)}
    path, score = viterbi(markov_unary, transitions, order=1)
    print(f"Greedy: A x, p=0.6*0.5={0.6*0.5:.2f}")
    print(f"Viterbi: {' '.join(path)}, p=0.4*0.9={math.exp(score):.2f}")
    print(f"Total path probability: {math.exp(log_partition(markov_unary, transitions)):.6f}")


if __name__ == "__main__":
    main()
