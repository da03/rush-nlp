# Attention as a Latent Variable: Modeling a Distribution over Attention

Latent Alignment and Variational Attention (NeurIPS 2018), by Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, and Alexander M. Rush, develops attention as an explicit latent variable with variational inference. The general idea is to model a distribution over where a network attends and reason over that distribution, rather than pass one deterministic weighted average into the prediction network.

## Normalized attention weights and a probabilistic model

An attention vector contains nonnegative weights that sum to one. That numerical property does not specify how uncertainty enters the prediction. A deterministic mechanism constructs one context vector from those weights and applies the downstream network once. A latent-variable mechanism defines alternative attention states, predicts under them, and integrates their contributions.

Write the attention state as z and the downstream computation as f. In general, f(E[z]) ≠ E[f(z)]. For a simple illustration, let z be 0 or 2 with equal probability and let f(z) = z². Applying f to the mean gives 1; averaging the two outputs gives 2. Neural prediction contains nonlinear operations, so moving the expectation across the network changes the model. This is the distinction between an average representation and an average over predictions.

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)
- [Structured Attention Networks](https://arxiv.org/abs/1702.00887)

## Latent alignment and variational attention

The 2018 paper makes alignment an explicit variable in the generative model. It studies categorical alignments, which select one source element, and Dirichlet alignments, which distribute attention across a mixture of elements. Amortized variational inference learns a posterior conditioned on observed inputs and outputs. Variance-reduction methods make latent inference practical, with experiments in machine translation and visual question answering.

Prior attention asks where to attend before the answer is known. Posterior attention asks which alignment explains an observed answer. These are different conditional distributions. The paper’s inference network uses target information during training; this is distinct from supplying future target words to a left-to-right predictor at generation time.

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## What a posterior over attention tells you

Imagine an image containing two people and a question asking who is holding a cup. Before seeing the answer, the model assigns attention probability to both people. Once the answer is observed, posterior inference redistributes probability toward alignments that explain it. This example defines an inference question independently of the visualization used to display the weights.

The distinction also matters when attention is composed with another probabilistic component. Explicit variables expose which quantities are conditioned on, which alternatives are integrated out, and what an approximation replaces. A sampled attention vector, its expectation, and its most probable value answer different questions; naming the distribution makes those choices inspectable.

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## How related attention methods differ

Show, Attend and Tell (ICML 2015) studies deterministic soft attention and sampled hard attention for image captioning. Its stochastic formulation uses a variational lower bound and a sampling-based learning rule. It provides an early reference for probabilistic selection; Latent Alignment and Variational Attention develops learned posterior inference for alignment and tighter variational training.

Structured Attention Networks (ICLR 2017) defines distributions over structured selections, including subsequences and syntactic trees. Differentiable graphical-model inference supplies expected annotations to the surrounding network. This enriches the structure of attention. Computing an expected annotation remains a separate operation from marginalizing the final nonlinear prediction over every attention structure.

Variational Attention for Sequence-to-Sequence Models (COLING 2018) models the context vector with Gaussian random variables in a variational encoder-decoder. Its purpose is to prevent deterministic attention from bypassing the model’s latent space. The latent object is the context vector, distinct from the categorical or simplex-valued alignment variable in Latent Alignment and Variational Attention.

Bayesian Attention Modules (NeurIPS 2020) constructs stochastic attention weights by normalizing Weibull or lognormal variables. Reparameterized training and data-dependent priors make the modules usable across attention architectures. This develops the broad distribution-over-attention perspective with a different distribution family and training construction.

- [Show, Attend and Tell: Neural Image Caption Generation with Visual Attention](https://proceedings.mlr.press/v37/xuc15.html)
- [Structured Attention Networks](https://arxiv.org/abs/1702.00887)
- [Variational Attention for Sequence-to-Sequence Models](https://aclanthology.org/C18-1142/)
- [Bayesian Attention Modules](https://arxiv.org/abs/2010.10604)
- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## Four questions for a probabilistic attention model

Start with the random object: a selected position, a distribution over positions, a context vector, or an entire structured selection. Next specify the prior and the information available to the posterior. Then identify what the prediction integrates: an intermediate representation or the output likelihood. Finally state whether training and prediction enumerate states, sample them, use an expectation, or optimize a variational approximation.

These choices determine the meaning of the model. They also make comparisons useful: two systems both called “variational attention” need not represent the same latent quantity or solve the same inference problem.

| Method | Random or structured object | Role of inference |
| --- | --- | --- |
| Latent Alignment and Variational Attention | Categorical or Dirichlet alignment | Learn posterior alignment and approximate marginal likelihood |
| Structured Attention Networks | Subsequence or tree selection | Compute expected annotations |
| Variational Attention for Seq2Seq | Gaussian context vector | Preserve a stochastic path through the encoder-decoder |
| Bayesian Attention Modules | Distribution over normalized attention weights | Reparameterized variational training |

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)
- [Structured Attention Networks](https://arxiv.org/abs/1702.00887)
- [Variational Attention for Sequence-to-Sequence Models](https://aclanthology.org/C18-1142/)
- [Bayesian Attention Modules](https://arxiv.org/abs/2010.10604)

## References

- Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, Alexander M. Rush. Latent Alignment and Variational Attention. NeurIPS 2018. https://arxiv.org/abs/1807.03756
- Kelvin Xu, Jimmy Lei Ba, Ryan Kiros, Kyunghyun Cho, Aaron Courville, Ruslan Salakhutdinov, Richard S. Zemel, Yoshua Bengio. Show, Attend and Tell: Neural Image Caption Generation with Visual Attention. ICML 2015. https://proceedings.mlr.press/v37/xuc15.html
- Yoon Kim, Carl Denton, Luong Hoang, Alexander M. Rush. Structured Attention Networks. ICLR 2017. https://arxiv.org/abs/1702.00887
- Hareesh Bahuleyan, Lili Mou, Olga Vechtomova, Pascal Poupart. Variational Attention for Sequence-to-Sequence Models. COLING 2018. https://aclanthology.org/C18-1142/
- Xinjie Fan, Shujian Zhang, Bo Chen, Mingyuan Zhou. Bayesian Attention Modules. NeurIPS 2020. https://arxiv.org/abs/2010.10604
