# Energy-based text generation: whole-sequence scoring, resampling and diffusion

A sequence-level energy model scores complete continuations, then uses those scores to change what a language model generates. [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1), by Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam and Marc’Aurelio Ranzato (ICLR 2020), combines an autoregressive proposal with a learned whole-sequence energy in a globally normalized model. This formulation connects directly to energy-based diffusion language models, where the residual energy couples token predictions within a denoising step.

## Original research

- Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1). ICLR 2020. [Record and citation](https://yuntiandeng.com/research/papers/residual-ebm/#citation).
- Anton Bakhtin, Yuntian Deng, Sam Gross, Myle Ott, Marc’Aurelio Ranzato, Arthur Szlam. [Residual Energy-Based Models for Text](https://www.jmlr.org/papers/v22/20-326.html). JMLR 22(40):1–41 · 2021. [Record and citation](https://yuntiandeng.com/research/papers/residual-ebm-jmlr/#citation).

## How a whole-sequence energy generates text

Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam and Marc’Aurelio Ranzato introduced the ICLR 2020 text-generation framework. Its arXiv version is dated 22 April 2020. A fixed autoregressive LM supplies candidate sequences; a bidirectional energy function scores them. The paper develops importance-weighted conditional generation and lower and upper log-probability bounds for perplexity evaluation.

The distribution is p(y | x) = q(y | x) exp(−E(x,y)) / Z(x). Here x is the context, y a complete continuation, q the base model, E the residual energy, and Z the normalizer over continuations. Lower energy increases probability relative to q. Noise-contrastive estimation trains the energy to distinguish real text from base-model samples.

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)

## Why a discriminator can change a generator

The JMLR 2021 article, Residual Energy-Based Models for Text, develops the connection between distinguishing generated text and improving its distribution. Anton Bakhtin and Yuntian Deng contributed equally; Sam Gross, Myle Ott, Marc’Aurelio Ranzato and Arthur Szlam complete the author list. A discriminator supplies information about where a generator overproduces or underproduces text. A residual model turns that information into a probability correction.

The base model provides fluent proposals and their relative frequency. The energy changes their relative desirability after viewing the sequence. An energy of zero everywhere leaves the base distribution unchanged. Adding the same constant to every energy also leaves the normalized distribution unchanged, because the constant cancels between numerator and denominator.

Two algebraic checks apply regardless of the network that computes the scores: changing a shared energy offset leaves candidate-selection probabilities unchanged, while lowering one candidate’s energy increases its probability.

- [Residual Energy-Based Models for Text](https://www.jmlr.org/papers/v22/20-326.html)

## Sample, score, then resample

Draw candidates from q, score each with E, and select with normalized weights proportional to exp(−E). This is importance resampling. Taking the highest-scoring candidate instead is reranking: it changes the selection rule. Both use a proposal-and-scoring pipeline, but define different output distributions.

For a worked example, assign three sampled candidates energies 0, log(2), and log(4). Their weights are 1, 1/2, and 1/4, giving selection probabilities 4/7, 2/7, and 1/7. Maximum-score selection always chooses the first candidate. Resampling preserves a distribution across the pool.

The base probability is already represented by drawing the pool from q. Multiplying each pool weight by q again changes the intended importance calculation. Likewise, a finite-pool normalizer is not an exact sum over all possible text. Increasing the number of proposals changes the approximation and the compute budget; changing the energy changes the target distribution.

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Residual Energy-Based Models for Text](https://www.jmlr.org/papers/v22/20-326.html)

## Where does the model represent dependencies between tokens?

The energy receives the complete candidate continuation. It can assign different scores to sequences that share a prefix but end differently, so the final selection depends on the words together. The base model proposes the text; the sequence-level energy changes the probability of the resulting continuation.

In diffusion generation, a denoiser proposes several unresolved tokens in parallel. EDLM applies the same base-times-energy construction to these proposed sequences, conditioned on the current noisy text. The sequence energy provides a joint correction for token dependencies. This is the concrete connection between residual EBM text generation and energy-based diffusion decoding.

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Energy-Based Diffusion Language Models for Text Generation](https://arxiv.org/html/2410.21357v4)

## The direct connection to diffusion language models

Energy-Based Diffusion Language Models (EDLM), by Minkai Xu and colleagues, was released on 28 October 2024 and published at ICLR 2025. It multiplies a diffusion denoiser’s distribution by a sequence-level residual energy conditioned on the noisy sequence and timestep. This corrects dependencies missed by factorized token predictions within a denoising step.

EDLM uses either an autoregressive-model-derived energy or an energy trained by NCE, then generates through parallel importance sampling. It cites Deng et al. (2020) in its related work and explicitly uses that work in partition-function estimation. The relationship is mathematical and algorithmic: residual correction, contrastive training, resampling and likelihood estimation.

The 2020 model corrects an autoregressive proposal for text generation. EDLM corrects a denoising distribution inside an iterative diffusion process. The location of the correction changes; the base-times-energy construction connects them.

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Energy-Based Diffusion Language Models for Text Generation](https://arxiv.org/html/2410.21357v4)

## Compare the base, energy and inference

Wang and Ou’s neural TRF paper supplies an earlier residual formulation and NCE approach, credited explicitly in the 2020 paper. The 2020 contribution develops conditional text generation and likelihood evaluation around the residual model. Unified Energy (2026) extends the diffusion discussion by analyzing dependency and invariance errors and combining their energy corrections.

| Method | Base and correction | Inference or evaluation focus |
| --- | --- | --- |
| Neural TRF with NCE · 2018 | Reference LM with exponential tilting | Speech-recognition rescoring |
| Residual EBM · 2020 | Autoregressive LM × sequence energy | Conditional generation by importance resampling; likelihood bounds |
| EDLM · 2025 | Diffusion denoiser × conditional sequence energy | Parallel proposals and resampling within denoising |
| Unified Energy · 2026 | Energy corrections for dependency and invariance | Improved diffusion decoding |

- [Learning Neural Trans-Dimensional Random Field Language Models with Noise-Contrastive Estimation](https://arxiv.org/abs/1710.10739)
- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Energy-Based Diffusion Language Models for Text Generation](https://arxiv.org/html/2410.21357v4)
- [Unified Energy for Invariant and Independent Decoding in Diffusion Language Models](https://arxiv.org/html/2606.09159v1)

## Use the energy example to inspect the mechanism

Change the energy strength β over the three-outcome distribution in the example. At β = 0, the probabilities are the base distribution. Increasing β shifts mass toward lower-energy outcomes, while the base probabilities still affect the result.

For importance resampling from candidates already drawn from the base model, the pool weights are exp(−E(x)). The base-model factor is already accounted for by that sampling step. This distinction connects the normalized model to its practical sampling procedure.


## Run finite-pool energy resampling

Download the self-contained [energy-resampling notebook](https://yuntiandeng.com/research/examples/energy_resampling.ipynb) or [Python script](https://yuntiandeng.com/research/examples/energy_resampling.py). It computes the exact residual model on three outcomes, draws candidate pools from the base distribution, and selects entries using their energy weights.

It also sums over all possible pool-count configurations to compute the exact output distribution induced by a finite pool. This exposes the approximation error without Monte Carlo noise. Duplicate candidates retain their multiplicity, and selecting by minimum energy is shown separately from probabilistic resampling.

The code runs with Python 3.9+ and its standard library. [Download all three examples and numerical checks](https://yuntiandeng.com/research/examples/research-examples.zip).

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)

## References

- Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. Residual Energy-Based Models for Text Generation. ICLR 2020. https://arxiv.org/html/2004.11714v1
- Anton Bakhtin, Yuntian Deng, Sam Gross, Myle Ott, Marc’Aurelio Ranzato, Arthur Szlam. Residual Energy-Based Models for Text. JMLR 22(40):1–41. https://www.jmlr.org/papers/v22/20-326.html
- Minkai Xu, Tomas Geffner, Karsten Kreis, Weili Nie, Yilun Xu, Jure Leskovec, Stefano Ermon, Arash Vahdat. Energy-Based Diffusion Language Models for Text Generation. ICLR 2025. https://arxiv.org/html/2410.21357v4
- Yuchen Yan, Minkai Xu, Zaiquan Yang, Yatao Bian. Unified Energy for Invariant and Independent Decoding in Diffusion Language Models. arXiv:2606.09159. https://arxiv.org/html/2606.09159v1
- Bin Wang, Zhijian Ou. Learning Neural Trans-Dimensional Random Field Language Models with Noise-Contrastive Estimation. ICASSP 2018. https://arxiv.org/abs/1710.10739
