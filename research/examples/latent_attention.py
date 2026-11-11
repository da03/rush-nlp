"""Attention as a latent variable: exact inference and the variational objective.

Run with Python 3.9+: python latent_attention.py
Uses the standard library, two source features, and a Bernoulli prediction head.
No model, dataset, network access, or additional packages are needed.

This example implements the categorical model and ELBO in Sections 2–3 of:
Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, Alexander M. Rush (NeurIPS 2018),
Latent Alignment and Variational Attention, https://arxiv.org/abs/1807.03756.
Guide: https://yuntiandeng.com/research/probabilistic-attention/

The paper learns an amortized posterior network across examples and also studies
Dirichlet alignments. Here, the generative parameters are fixed and a free
categorical q is optimized for one observation, exposing the ELBO directly.
"""

import math


def logsumexp(values):
    largest = max(values)
    return largest + math.log(sum(math.exp(v - largest) for v in values))


def softmax(logits):
    normalizer = logsumexp(logits)
    return [math.exp(v - normalizer) for v in logits]


def log_sigmoid(value):
    return -max(-value, 0.0) - math.log1p(math.exp(-abs(value)))


def validate_probabilities(probabilities):
    if not probabilities or any(p <= 0 or not math.isfinite(p) for p in probabilities):
        raise ValueError("Use positive, finite categorical probabilities.")
    if not math.isclose(sum(probabilities), 1.0, abs_tol=1e-12):
        raise ValueError("Categorical probabilities must sum to one.")


def log_likelihoods(features, observed_y, weight=2.0, bias=0.0):
    """log p(y | z=i, x): z selects source feature i before the nonlinear head."""
    if observed_y not in (0, 1):
        raise ValueError("The observation must be a Bernoulli label, 0 or 1.")
    sign = 2 * observed_y - 1
    return [log_sigmoid(sign * (weight * feature + bias)) for feature in features]


def deterministic_probability(features, prior, observed_y=1, weight=2.0, bias=0.0):
    """p_soft(y | x): average features first, then apply the nonlinear head."""
    validate_probabilities(prior)
    if len(features) != len(prior):
        raise ValueError("One prior probability is required for each feature.")
    context = sum(p * feature for p, feature in zip(prior, features))
    return math.exp(log_likelihoods([context], observed_y, weight, bias)[0])


def exact_inference(prior, log_likelihood):
    """Return log p(y | x) and the posterior p(z | x, y)."""
    validate_probabilities(prior)
    if len(prior) != len(log_likelihood):
        raise ValueError("The prior and likelihood must describe the same states.")
    log_joint = [math.log(p) + ll for p, ll in zip(prior, log_likelihood)]
    log_evidence = logsumexp(log_joint)
    posterior = [math.exp(v - log_evidence) for v in log_joint]
    return log_evidence, posterior


def kl_divergence(q, p):
    validate_probabilities(q)
    validate_probabilities(p)
    if len(q) != len(p):
        raise ValueError("KL arguments must describe the same states.")
    return sum(qi * (math.log(qi) - math.log(pi)) for qi, pi in zip(q, p))


def elbo(q, prior, log_likelihood):
    """E_q[log p(y | z,x)] - KL(q(z) || p(z | x))."""
    if len(q) != len(log_likelihood):
        raise ValueError("The posterior and likelihood must describe the same states.")
    return sum(qi * ll for qi, ll in zip(q, log_likelihood)) - kl_divergence(q, prior)


def elbo_gradient(logits, prior, log_likelihood):
    """Exact derivative of the enumerated ELBO with respect to q's logits."""
    q = softmax(logits)
    objective = elbo(q, prior, log_likelihood)
    advantage = [ll + math.log(p) - math.log(qi) - objective
                 for qi, p, ll in zip(q, prior, log_likelihood)]
    return [qi * value for qi, value in zip(q, advantage)]


def optimize_variational(prior, log_likelihood, steps=200, learning_rate=0.5):
    """Optimize this observation's free q; no neural-network training occurs."""
    logits = [math.log(p) for p in prior]
    history = []
    for step in range(steps + 1):
        q = softmax(logits)
        history.append((step, elbo(q, prior, log_likelihood)))
        if step < steps:
            gradient = elbo_gradient(logits, prior, log_likelihood)
            logits = [v + learning_rate * g for v, g in zip(logits, gradient)]
    return softmax(logits), history


def main():
    features = [0.0, 2.0]
    prior = [0.5, 0.5]
    print("Source features:", features, "prior p(z | x):", prior)
    print("Head: p(y=1 | selected feature h) = sigmoid(2*h)")
    for observed_y in (1, 0):
        likelihood = log_likelihoods(features, observed_y)
        log_evidence, posterior = exact_inference(prior, likelihood)
        q, history = optimize_variational(prior, likelihood)
        soft = deterministic_probability(features, prior, observed_y)
        print("\nObserved y =", observed_y)
        print(f"  Deterministic attention probability: {soft:.6f}")
        print(f"  Exact marginal probability:         {math.exp(log_evidence):.6f}")
        print("  Exact posterior p(z | x,y):", [round(v, 6) for v in posterior])
        print("  Optimized variational q:   ", [round(v, 6) for v in q])
        print(f"  Prior/Jensen bound, q=p:  {history[0][1]:.9f}")
        print(f"  Optimized ELBO:          {history[-1][1]:.9f}")
        print(f"  Exact log likelihood:    {log_evidence:.9f}")
        print(f"  Gap = KL(q || posterior): {kl_divergence(q, posterior):.9g}")
    print("\nPrediction uses the prior and integrates z; the observed label enters posterior inference.")


if __name__ == "__main__":
    main()
