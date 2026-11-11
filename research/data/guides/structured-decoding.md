# Structured Decoding: Higher-Order CRFs, Diffusion Language Models, and Candidate Lattices

Parallel neural computation does not require independent output decisions. Yuntian Deng and Alexander M. Rush developed higher-order CRF cascades for text generation in Cascaded Text Generation with Markov Transformers (NeurIPS 2020), followed by candidate-lattice generation with exact path search in Sequence-to-Lattice Models for Fast Translation (Findings of EMNLP 2021). These contributions connect to two current problems: modeling dependencies among tokens generated together by diffusion language models, and selecting coherent drafts from parallel token candidates.

## Why parallel predictions need a joint decision

Consider two valid continuations: “the dog runs” and “the dogs run.” Independent choices at each position also admit “the dog run.” Better representations help a network predict each marginal, but a product of marginals still cannot express that the noun and verb must agree. An explicit joint model assigns scores to combinations, making compatibility part of the output distribution and decoding procedure.

This separates two design choices: how expensive neural scores are computed, and how the final sequence is selected. Scores for many alternatives can be computed together, then combined by a small structured inference algorithm. Sun and colleagues’ Fast Structured Decoding for Sequence Models (NeurIPS 2019) combines non-autoregressive emissions with an approximate first-order CRF and dynamic transitions. Higher-order contexts, successive pruning, and candidate-lattice construction provide additional design choices.

- [Fast Structured Decoding for Sequence Models](https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html)
- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)

## Higher-order CRFs: Cascaded Text Generation with Markov Transformers

Cascaded Text Generation introduces a sequence of CRFs with increasing Markov order. It begins with independent token scores, then adds dependencies over progressively longer spans. A single Markov Transformer supplies the potentials at every order through controlled context windows. Max-marginals score a span by the best complete sequence containing it; pruning retains promising spans before the next, more expressive stage.

The contribution combines higher-order output dependencies, shared neural parameterization, and parallel structured inference. This is distinct from the first-order dynamic CRF in Sun et al. The cascade restricts the search space, so its final result is exact within the retained states rather than an exhaustive optimum over every possible sentence. Its parallel dynamic-programming formulation has logarithmic depth in sequence length for fixed retained width.

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Fast Structured Decoding for Sequence Models](https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html)

## From higher-order CRFs to joint diffusion decoding

Diffusion introduces a repeated version of the same coordination problem: several uncertain tokens are resolved during one denoising step. The connection to structured generation is a modeling principle: use a tractable joint distribution to couple those decisions while retaining parallel neural computation. A Markov order describes dependence across output positions; a diffusion timestep describes the progression from corrupted to recovered text. They are different axes.

CoDD, introduced in Breaking the Factorization Barrier in Diffusion Language Models (ICML 2026), combines factorized neural predictions with a probabilistic-circuit structural prior. Its experiments instantiate that prior with a hidden Markov model. The product supports joint inference without materializing a vocabulary-sized table for every possible token combination. This shares the structured-generation goal, while using latent-state structure and diffusion-conditioned inference rather than a cascade of increasing observed-token context orders.

DA-DLM (EMNLP 2026) makes the relationship to non-autoregressive translation explicit. It adapts directed-acyclic-graph modeling to iterative denoising: node groups correspond to output positions, and previously fixed tokens become anchors connected to unresolved candidates. Its graph changes as denoising proceeds. These are precise connections between earlier structured output modeling and present diffusion methods; they do not identify the original translation models as diffusion models.

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Breaking the Factorization Barrier in Diffusion Language Models](https://proceedings.mlr.press/v306/li26fd.html)
- [DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models](https://aclanthology.org/2026.emnlp-main.2094/)

## Candidate lattices: Sequence-to-Lattice Models for Fast Translation

Sequence-to-Lattice replaces a deep decoder with candidate lookup, neural edge scoring, and path search. A statistical alignment model proposes a small vocabulary at each output position. A deep encoder and a shallow scoring head evaluate transitions between candidates in parallel. Viterbi then selects the highest-scoring complete path.

The paper specifies a first-order conditional Markov model with locally normalized transition probabilities. Exact Viterbi search refers to the constructed candidate lattice. It neither restores candidates excluded during construction nor makes the model a globally normalized higher-order CRF. The central computational separation is reusable: build alternatives cheaply, score compatible neighbors together, and search the resulting graph.

- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)

## From candidate lattices to coherent speculative drafts

Parallel speculative drafting creates a related setting: several candidates are available at each future position, but individually attractive choices need not form a useful draft. LiLiCorr keeps top-K candidates, computes incoming and outgoing vectors in a lightweight network, scores adjacent compatibility with batched operations, and performs a greedy walk. Its training objective targets accepted prefixes and co-adapts the drafter and scoring head.

The connection to Sequence-to-Lattice is the candidate–edge–path architecture. The differences are substantive: translation candidates come from an alignment-based lookup model; LiLiCorr candidates come from a parallel drafter. Sequence-to-Lattice uses exact Viterbi for a complete path objective; LiLiCorr uses local normalization and greedy selection aligned with prefix acceptance.

DiffuSpec uses a diffusion model as a parallel drafter and introduces Causal-consistency Path Search over its token lattice, together with draft-length adaptation from acceptance feedback. Here the graph mediates between bidirectional draft proposals and an autoregressive verifier. A lattice describes the candidate organization; the scoring rule and verification procedure determine what selecting a path accomplishes.

- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)
- [LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding](https://arxiv.org/abs/2608.20530)
- [DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding](https://aclanthology.org/2026.findings-acl.1048/)

## Choose the inference objective before choosing the graph

Three operations over the same graph answer different questions. Maximization finds the best complete path under a score. Marginalization sums over alternatives to measure probability or train a latent model. Sampling draws a sequence according to a distribution. Replacing one operation with another changes the algorithm even when the nodes and edges are identical.

A small numerical example makes the distinction concrete. Suppose the first decision offers A with probability 0.6 and B with probability 0.4. The strongest continuation after A has conditional probability 0.5; after B it has probability 0.9. Greedy selection begins with A. Whole-path maximization chooses B because 0.4 × 0.9 exceeds 0.6 × 0.5. In speculative decoding, the target verifier introduces another objective: the useful quantity is the accepted prefix, together with the cost of producing it.

To compare implementations, identify the candidate set, the edge dependence, the normalization, and the inference operation. Then measure the work that dominates runtime: neural passes, candidate scoring, dynamic programming, and verification. A graph alone establishes neither an exact decoder nor a speed advantage.

| Design | Dependence or score | Final operation |
| --- | --- | --- |
| Cascaded generation | Increasing Markov order; pruned spans | Structured maximization within retained states |
| Sequence-to-Lattice | First-order conditional edge probabilities | Exact Viterbi on candidate lattice |
| CoDD / DA-DLM | Joint structure inside denoising | Diffusion-conditioned inference |
| LiLiCorr / DiffuSpec | Compatibility or causal draft paths | Draft selection followed by verification |

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)
- [Breaking the Factorization Barrier in Diffusion Language Models](https://proceedings.mlr.press/v306/li26fd.html)
- [DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models](https://aclanthology.org/2026.emnlp-main.2094/)
- [LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding](https://arxiv.org/abs/2608.20530)
- [DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding](https://aclanthology.org/2026.findings-acl.1048/)

## Run higher-order path search

Download the self-contained [joint-decoding notebook](https://yuntiandeng.com/research/examples/joint_decoding.ipynb) or [Python script](https://yuntiandeng.com/research/examples/joint_decoding.py). A three-token compatibility factor changes the sequence selected from a small candidate lattice. Max-sum dynamic programming finds the best path, and sum-product computes the global normalizer.

A separate locally normalized example demonstrates why greedy token selection and whole-path Viterbi search choose different paths. The examples expose exact structured inference on fixed scores. The papers supply the neural scoring, higher-order cascade, pruning and candidate-construction methods described above.

The code runs with Python 3.9+ and its standard library. [Download all three examples and numerical checks](https://yuntiandeng.com/research/examples/research-examples.zip).

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)

## References

- Yuntian Deng, Alexander M. Rush. Cascaded Text Generation with Markov Transformers. NeurIPS 2020. https://arxiv.org/abs/2006.01112
- Yuntian Deng, Alexander M. Rush. Sequence-to-Lattice Models for Fast Translation. Findings of EMNLP 2021. https://aclanthology.org/2021.findings-emnlp.318/
- Zhiqing Sun, Zhuohan Li, Haoqing Wang, Di He, Zi Lin, Zhi-Hong Deng. Fast Structured Decoding for Sequence Models. NeurIPS 2019. https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html
- Ian Li, Zilei Shao, Benjie Wang, Rose Yu, Guy Van den Broeck, Anji Liu. Breaking the Factorization Barrier in Diffusion Language Models. ICML 2026. https://proceedings.mlr.press/v306/li26fd.html
- Pengyu Ji, Zichen Zhang, Xiang Hu, Kewei Tu. DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models. EMNLP 2026. https://aclanthology.org/2026.emnlp-main.2094/
- Matan Rusanovsky, Yoav Miron, Roy Uziel, Omer Belhasin, Hao Guo, Ran Zilberstein, Maor Ashkenazi, Michael Elad. LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding. arXiv 2026. https://arxiv.org/abs/2608.20530
- Guanghao Li, Zhihui Fu, Min Fang, Qibin Zhao, Ming Tang, Chun Yuan, Jun Wang. DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding. Findings of ACL 2026. https://aclanthology.org/2026.findings-acl.1048/
