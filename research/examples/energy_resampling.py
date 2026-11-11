"""Residual energy correction: the exact target and finite-pool resampling.

Run with Python 3.9+: python energy_resampling.py
Uses standard-library arithmetic over three explicitly listed outcomes.

Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc'Aurelio Ranzato,
Residual Energy-Based Models for Text Generation (ICLR 2020),
https://arxiv.org/abs/2004.11714, Sections 3 and 3.3.
Guide: https://yuntiandeng.com/research/energy-based-text-generation/

The original model combines a pretrained language model and a learned energy.
Here q and E are supplied numbers: the example isolates normalization and the
sampling procedure, including the distribution induced by a finite pool.
"""

import math
import random


def validate_inputs(base, energies, beta):
    if not base or len(base) != len(energies):
        raise ValueError("Supply one energy per base-model outcome.")
    if any(p < 0 or not math.isfinite(p) for p in base):
        raise ValueError("Base probabilities must be finite and nonnegative.")
    if not math.isclose(sum(base), 1.0, abs_tol=1e-12):
        raise ValueError("Base probabilities must sum to one.")
    if not math.isfinite(beta) or any(not math.isfinite(e) for e in energies):
        raise ValueError("Use finite energy values and strength.")


def normalized_exponentials(log_weights):
    largest = max(log_weights)
    weights = [math.exp(value - largest) for value in log_weights]
    total = sum(weights)
    return [value / total for value in weights]


def residual_distribution(base, energies, beta=1.0):
    """Exact p(i) = q(i) exp(-beta E(i)) / Z on the listed outcome space."""
    validate_inputs(base, energies, beta)
    return normalized_exponentials([math.log(p) - beta * e if p else -math.inf
                                    for p, e in zip(base, energies)])


def pool_distribution(pool, energies, beta=1.0):
    """Distribution after selecting one entry from an already sampled pool.

    Each entry's weight is exp(-beta E), with no extra q factor. Duplicates
    are separate entries; their combined probability is added to their outcome.
    """
    if not pool:
        raise ValueError("The candidate pool must contain at least one entry.")
    if any(i < 0 or i >= len(energies) for i in pool):
        raise ValueError("A pool entry must be an outcome index.")
    weights = normalized_exponentials([-beta * energies[i] for i in pool])
    result = [0.0] * len(energies)
    for i, weight in zip(pool, weights):
        result[i] += weight
    return result


def resample_one(base, energies, pool_size, rng, beta=1.0):
    """Draw N proposals from q, then select one by its energy weight."""
    validate_inputs(base, energies, beta)
    if not isinstance(pool_size, int) or pool_size < 1:
        raise ValueError("The pool size must be a positive integer.")
    pool = rng.choices(range(len(base)), weights=base, k=pool_size)
    weights = normalized_exponentials([-beta * energies[i] for i in pool])
    return rng.choices(pool, weights=weights, k=1)[0]


def count_vectors(total, categories):
    if categories == 1:
        yield (total,)
    else:
        for count in range(total + 1):
            for remainder in count_vectors(total - count, categories - 1):
                yield (count,) + remainder


def finite_pool_distribution(base, energies, pool_size, beta=1.0):
    """Exact finite-N output law, summing multinomial pool counts.

    This costs binomial(N+K-1, K-1) states for K possible outcomes. It is a
    teaching/reference computation for small spaces, not a text-generation
    algorithm. It integrates the randomness of both proposal and selection.
    """
    validate_inputs(base, energies, beta)
    if not isinstance(pool_size, int) or pool_size < 1:
        raise ValueError("The pool size must be a positive integer.")
    result = [0.0] * len(base)
    for counts in count_vectors(pool_size, len(base)):
        if any(count and not p for count, p in zip(counts, base)):
            continue
        # Multinomial mass of this unordered pool: N! / prod(n_i!) prod(q_i^n_i).
        log_mass = math.lgamma(pool_size + 1) - sum(math.lgamma(c + 1) for c in counts)
        log_mass += sum(c * math.log(p) for c, p in zip(counts, base) if c)
        mass = math.exp(log_mass)
        # Count multiplicity is part of the sampling distribution; q is not
        # multiplied into these conditional selection weights a second time.
        selected = normalized_exponentials([math.log(c) - beta * e if c else -math.inf
                                           for c, e in zip(counts, energies)])
        for i, probability in enumerate(selected):
            result[i] += mass * probability
    return result


def total_variation(p, q):
    return 0.5 * sum(abs(a - b) for a, b in zip(p, q))


def main():
    labels = ["candidate A", "candidate B", "candidate C"]
    base = [0.6, 0.3, 0.1]
    energies = [1.0, 0.0, -1.0]
    target = residual_distribution(base, energies)
    print("Outcomes:", labels)
    print("Base q: ", base, "energies:", energies)
    print("Exact p:", [round(p, 6) for p in target])
    print("\nExact output distribution of finite-pool importance resampling:")
    for size in (1, 2, 8, 32):
        result = finite_pool_distribution(base, energies, size)
        print(f"N={size:2d}: {[round(p, 6) for p in result]}  "
              f"distance to target={total_variation(result, target):.6f}")
    pool = [0, 0, 1, 2]
    print("\nFixed pool:", [labels[i] for i in pool])
    print("Resampling probabilities:", [round(p, 6) for p in pool_distribution(pool, energies)])
    winner = min(pool, key=lambda i: energies[i])
    print("Minimum-energy reranking always selects", labels[winner], "from this fixed pool.")
    selected = resample_one(base, energies, pool_size=32, rng=random.Random(7))
    print("One seeded sample-and-resample draw:", labels[selected])
    print("N=1 leaves q unchanged. Larger finite pools approximate p; they do not equal it exactly.")


if __name__ == "__main__":
    main()
