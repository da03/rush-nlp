# Latent Alignment and Variational Attention

Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, Alexander M. Rush. NeurIPS 2018 (2018).

Models alignment as a latent variable and learns approximate posterior inference through variational attention.

A general framework for distributions over attention, beyond a deterministic attention vector.

## Abstract

Neural attention has become central to many state-of-the-art models in natural language processing and related domains. Attention networks are an easy-to-train and effective method for softly simulating alignment; however, the approach does not marginalize over latent alignments in a probabilistic sense. This property makes it difficult to compare attention to other alignment approaches, to compose it with probabilistic models, and to perform posterior inference conditioned on observed data. A related latent approach, hard attention, fixes these issues, but is generally harder to train and less accurate. This work considers variational attention networks, alternatives to soft and hard attention for learning latent variable alignment models, with tighter approximation bounds based on amortized variational inference. We further propose methods for reducing the variance of gradients to make these approaches computationally feasible. Experiments show that for machine translation and visual question answering, inefficient exact latent variable models outperform standard neural attention, but these gains go away when using hard attention based training. On the other hand, variational attention retains most of the performance gain but with training speed comparable to neural attention.

[Original paper](https://arxiv.org/abs/1807.03756)

## Citation

```bibtex
@inproceedings{article_number,
  title = {{Latent Alignment and Variational Attention}},
  author = {Deng, Yuntian and Kim, Yoon and Chiu, Justin and Guo, Demi and Rush, Alexander M.},
  year = {2018},
  booktitle = {NeurIPS 2018},
  url = {https://arxiv.org/abs/1807.03756},
  eprint = {1807.03756},
  archivePrefix = {arXiv}
}
```
