"""Independent numerical checks. Run: python -m unittest -v test_examples.py"""

import itertools
import math
import random
import unittest

import energy_resampling as energy
import joint_decoding as decoding
import latent_attention as attention


class LatentAttentionChecks(unittest.TestCase):
    def test_prediction_and_posterior_are_normalized(self):
        prior = [0.2, 0.3, 0.5]
        features = [-1.0, 0.0, 2.0]
        probabilities = []
        for y in (0, 1):
            likelihood = attention.log_likelihoods(features, y)
            log_p, posterior = attention.exact_inference(prior, likelihood)
            probabilities.append(math.exp(log_p))
            self.assertAlmostEqual(sum(posterior), 1.0, places=12)
            # Recover the joint by two different factorizations (Bayes' rule).
            for pi, ll, post in zip(prior, likelihood, posterior):
                self.assertAlmostEqual(pi * math.exp(ll), post * math.exp(log_p), places=12)
        self.assertAlmostEqual(sum(probabilities), 1.0, places=12)

    def test_nonlinearity_and_equal_feature_control(self):
        prior = [0.5, 0.5]
        exact, _ = attention.exact_inference(prior, attention.log_likelihoods([0, 2], 1))
        deterministic = attention.deterministic_probability([0, 2], prior)
        self.assertGreater(abs(deterministic - math.exp(exact)), 0.1)
        equal, _ = attention.exact_inference(prior, attention.log_likelihoods([2, 2], 1))
        self.assertAlmostEqual(math.exp(equal), attention.deterministic_probability([2, 2], prior))

    def test_elbo_gap_equals_posterior_kl(self):
        prior = [0.2, 0.3, 0.5]
        likelihood = attention.log_likelihoods([-1, 0, 2], 0)
        log_p, posterior = attention.exact_inference(prior, likelihood)
        for q in ([0.1, 0.2, 0.7], prior, posterior):
            gap = log_p - attention.elbo(q, prior, likelihood)
            self.assertGreaterEqual(gap, -1e-12)
            self.assertAlmostEqual(gap, attention.kl_divergence(q, posterior), places=12)
        self.assertAlmostEqual(attention.elbo(posterior, prior, likelihood), log_p, places=12)

    def test_variational_gradient_by_finite_differences(self):
        prior, logits = [0.2, 0.3, 0.5], [-0.4, 0.7, 0.2]
        likelihood = attention.log_likelihoods([-1, 0, 2], 1)
        gradient = attention.elbo_gradient(logits, prior, likelihood)
        eps = 1e-6
        for i, actual in enumerate(gradient):
            plus, minus = logits.copy(), logits.copy()
            plus[i] += eps
            minus[i] -= eps
            numeric = (attention.elbo(attention.softmax(plus), prior, likelihood)
                       - attention.elbo(attention.softmax(minus), prior, likelihood)) / (2 * eps)
            self.assertAlmostEqual(actual, numeric, places=8)

    def test_variational_optimization_tightens_bound(self):
        for y in (0, 1):
            prior = [0.5, 0.5]
            likelihood = attention.log_likelihoods([0, 2], y)
            log_p, posterior = attention.exact_inference(prior, likelihood)
            q, history = attention.optimize_variational(prior, likelihood)
            self.assertLess(log_p - history[-1][1], 1e-6)
            self.assertGreater(history[-1][1], history[0][1])
            self.assertTrue(all(a[1] <= b[1] + 1e-12 for a, b in zip(history, history[1:])))
            self.assertLess(max(abs(a - b) for a, b in zip(q, posterior)), 1e-3)


class JointDecodingChecks(unittest.TestCase):
    def test_dynamic_programming_against_brute_force(self):
        rng = random.Random(19)
        for length in (1, 2, 4, 5):
            for order in range(3):
                for _ in range(4):
                    unary = [{str(k): rng.uniform(-3, 3) for k in range(2)} for _ in range(length)]
                    factors = {}
                    for end in range(length):
                        for width in range(2, min(order + 1, end + 1) + 1):
                            for span in itertools.product(("0", "1"), repeat=width):
                                factors[end, span] = rng.uniform(-2, 2)
                    reference = decoding.enumerate_paths(unary, factors, order)
                    expected_path, expected_score = max(reference, key=lambda item: item[1])
                    actual_path, actual_score = decoding.viterbi(unary, factors, order)
                    self.assertEqual(actual_path, expected_path)
                    self.assertAlmostEqual(actual_score, expected_score, places=12)
                    self.assertAlmostEqual(decoding.log_partition(unary, factors, order),
                                           decoding.logsumexp([score for _, score in reference]), places=12)

    def test_higher_order_factor_changes_the_decision(self):
        unary, bigrams, trigrams = decoding.agreement_model()
        self.assertEqual(decoding.viterbi(unary, {}, 0)[0], ("dog", "often", "run"))
        self.assertEqual(decoding.viterbi(unary, bigrams, 1)[0], ("dog", "often", "run"))
        self.assertEqual(decoding.viterbi(unary, {**bigrams, **trigrams}, 2)[0],
                         ("dog", "often", "runs"))
        # Mirroring the agreement evidence changes the output back.
        reversed_agreement = {(end, (noun, adverb, "run" if verb == "runs" else "runs")): value
                              for (end, (noun, adverb, verb)), value in trigrams.items()}
        self.assertEqual(decoding.viterbi(unary, {**bigrams, **reversed_agreement}, 2)[0],
                         ("dog", "often", "run"))

    def test_shared_offset_preserves_path_and_probabilities(self):
        unary, bigrams, trigrams = decoding.agreement_model()
        factors = {**bigrams, **trigrams}
        shifted = [{token: score + 7 for token, score in row.items()} for row in unary]
        p0, s0 = decoding.viterbi(unary, factors, 2)
        p1, s1 = decoding.viterbi(shifted, factors, 2)
        self.assertEqual(p0, p1)
        self.assertAlmostEqual(s1 - s0, 21)
        self.assertAlmostEqual(s0 - decoding.log_partition(unary, factors, 2),
                               s1 - decoding.log_partition(shifted, factors, 2))

    def test_local_markov_lattice_sums_to_one(self):
        unary = [{"A": math.log(.6), "B": math.log(.4)}, {"x": 0., "y": 0.}]
        factors = {(1, ("A", "x")): math.log(.5), (1, ("A", "y")): math.log(.5),
                   (1, ("B", "x")): math.log(.9), (1, ("B", "y")): math.log(.1)}
        self.assertEqual(decoding.viterbi(unary, factors)[0], ("B", "x"))
        self.assertAlmostEqual(decoding.log_partition(unary, factors), 0.0)


class EnergyResamplingChecks(unittest.TestCase):
    def test_zero_energy_and_shared_offset(self):
        base, energies = [.6, .3, .1], [1., 0., -1.]
        target = energy.residual_distribution(base, energies)
        for a, b in zip(base, energy.residual_distribution(base, energies, beta=0)):
            self.assertAlmostEqual(a, b)
        for a, b in zip(target, energy.residual_distribution(base, [e + 900 for e in energies])):
            self.assertAlmostEqual(a, b, places=12)
        self.assertGreater(target[2], base[2])

    def test_pool_multiplicity_and_no_extra_base_factor(self):
        # Two copies of A each get weight 1; B gets weight 1/2; C gets 1/4.
        actual = energy.pool_distribution([0, 0, 1, 2], [0, math.log(2), math.log(4)])
        for a, b in zip(actual, [8/11, 2/11, 1/11]):
            self.assertAlmostEqual(a, b)

    def test_finite_pool_counts_against_ordered_enumeration(self):
        base, energies, size = [.6, .3, .1], [1., 0., -1.], 3
        brute = [0.0] * 3
        for pool in itertools.product(range(3), repeat=size):
            mass = math.prod(base[i] for i in pool)
            selected = energy.pool_distribution(pool, energies)
            for i, p in enumerate(selected):
                brute[i] += mass * p
        actual = energy.finite_pool_distribution(base, energies, size)
        for a, b in zip(actual, brute):
            self.assertAlmostEqual(a, b, places=12)
        self.assertAlmostEqual(sum(actual), 1.0, places=12)

    def test_finite_pool_limits_and_zero_support(self):
        base, energies = [.6, .3, .1], [1., 0., -1.]
        target = energy.residual_distribution(base, energies)
        n1 = energy.finite_pool_distribution(base, energies, 1)
        for a, b in zip(n1, base):
            self.assertAlmostEqual(a, b)
        for size in (1, 2, 8, 32):
            for a, b in zip(energy.finite_pool_distribution(base, energies, size, beta=0), base):
                self.assertAlmostEqual(a, b, places=12)
        self.assertLess(energy.total_variation(energy.finite_pool_distribution(base, energies, 32), target),
                        energy.total_variation(energy.finite_pool_distribution(base, energies, 2), target))
        self.assertEqual(energy.residual_distribution([1., 0.], [0., -100.]), [1., 0.])
        self.assertEqual(energy.finite_pool_distribution([1., 0.], [0., -100.], 4), [1., 0.])

    def test_sampled_procedure_matches_its_finite_pool_law(self):
        rng = random.Random(27)
        base, energies, size, draws = [.6, .3, .1], [1., 0., -1.], 4, 20000
        counts = [0, 0, 0]
        for _ in range(draws):
            counts[energy.resample_one(base, energies, size, rng)] += 1
        expected = energy.finite_pool_distribution(base, energies, size)
        self.assertLess(max(abs(c / draws - p) for c, p in zip(counts, expected)), .015)


if __name__ == "__main__":
    unittest.main()
