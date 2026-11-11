# Runnable research examples

These examples make three probabilistic modeling choices inspectable in a small
outcome space. Every Python script uses Python 3.9+ and the standard library.
The notebooks contain the complete corresponding code and run without downloads,
model weights, API keys, or a GPU.

- [Latent attention: Python](latent_attention.py) · [Notebook](latent_attention.ipynb)
- [Joint decoding: Python](joint_decoding.py) · [Notebook](joint_decoding.ipynb)
- [Energy resampling: Python](energy_resampling.py) · [Notebook](energy_resampling.ipynb)

Run a downloaded example with `python latent_attention.py`,
`python joint_decoding.py`, or `python energy_resampling.py`.
Download all three scripts and [the numerical checks](test_examples.py) into one
directory to run `python -m unittest -v test_examples.py`.

## Attention as a latent variable

[Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)
by Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, and Alexander M. Rush
(NeurIPS 2018) models a distribution over alignments and learns posterior
inference. The [research guide](https://yuntiandeng.com/research/probabilistic-attention/)
explains categorical and Dirichlet attention.

The example uses two scalar source features and a Bernoulli prediction head.
It compares averaging features before prediction with marginalizing the
prediction over the categorical alignment. It then computes the observed-label
posterior and optimizes a free categorical variational distribution for that
observation. The exact log likelihood minus the ELBO equals the KL divergence
to the posterior. The paper's amortized neural inference network and Dirichlet
model are separate extensions beyond this finite categorical example.

## Independent decisions and joint decoding

[Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
by Yuntian Deng and Alexander M. Rush (NeurIPS 2020) develops higher-order CRF
cascades for text generation. The example shows why a three-token factor changes
the selected sequence when independently attractive choices disagree.
Max-sum dynamic programming returns the best complete path; sum-product computes
the partition function. Exhaustive enumeration supplies an independent reference.

[Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)
by Yuntian Deng and Alexander M. Rush (Findings of EMNLP 2021) constructs candidate
lattices, scores conditional edges, and uses Viterbi search. A second example
shows greedy selection and whole-path maximization choosing different paths
in a locally normalized Markov lattice. This normalization differs from the
globally normalized CRF above.

These are fixed-score examples. They do not run a Markov Transformer, cascade
pruning, translation, diffusion denoising, or a speed benchmark. The
[structured-decoding guide](https://yuntiandeng.com/research/structured-decoding/)
connects the full methods to joint diffusion decoding and candidate drafting.

## Energy correction and importance resampling

[Residual Energy-Based Models for Text Generation](https://arxiv.org/abs/2004.11714)
by Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, and Marc'Aurelio Ranzato
(ICLR 2020) combines a pretrained language model with a sequence-level energy.
The [energy guide](https://yuntiandeng.com/research/energy-based-text-generation/)
explains its relationship to energy-based diffusion language models.

The script computes the exact residual distribution on three outcomes, samples
candidates from the base distribution, and resamples using their energy weights.
It also computes the exact distribution induced by each finite pool size, so
the approximation error is visible without Monte Carlo noise. Pool entries
are weighted by `exp(-beta * energy)`: sampling from the base distribution has
already accounted for the base probability. Duplicate candidates retain their
multiplicity. Selecting the minimum-energy candidate instead changes the rule
from resampling to reranking.

## Run the original Tree Prompting notebook

Use the authors' existing [Tree Prompting notebook](https://github.com/csinva/tree-prompt/blob/master/demo.ipynb)
with its [repository installation instructions](https://github.com/csinva/tree-prompt).
It selects 100 training and 100 validation examples from Rotten Tomatoes, uses
GPT-2 to extract prompt features, fits `TreePromptClassifier`, calls `predict`,
and displays the learned tree with scikit-learn's `plot_tree`. It downloads a
dataset and model; it is distinct from the three download-free examples above.
See the [decision-tree guide](https://yuntiandeng.com/research/llm-decision-trees/)
and [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://aclanthology.org/2023.emnlp-main.384/)
by John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, and Yuntian Deng
(EMNLP 2023).
