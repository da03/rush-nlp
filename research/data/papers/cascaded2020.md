# Cascaded Text Generation with Markov Transformers

Yuntian Deng, Alexander M. Rush. NeurIPS 2020 (2020).

Higher-order CRF cascades for parallel text generation, parameterized by one Markov Transformer.

Increasing output dependence with tractable structured inference connects to joint modeling inside diffusion decoding.

## Abstract

The two dominant approaches to neural text generation are fully autoregressive models, using serial beam search decoding, and non-autoregressive models, using parallel decoding with no output dependencies. This work proposes an autoregressive model with sub-linear parallel time generation. Noting that conditional random fields with bounded context can be decoded in parallel, we propose an efficient cascaded decoding approach for generating high-quality output. To parameterize this cascade, we introduce a Markov transformer, a variant of the popular fully autoregressive model that allows us to simultaneously decode with specific autoregressive context cutoffs. This approach requires only a small modification from standard autoregressive training, while showing competitive accuracy/speed tradeoff compared to existing methods on five machine translation datasets.

[Original paper](https://arxiv.org/abs/2006.01112)

## Citation

```bibtex
@inproceedings{deng2020cascaded,
  title = {{Cascaded Text Generation with Markov Transformers}},
  author = {Deng, Yuntian and Rush, Alexander M.},
  year = {2020},
  booktitle = {NeurIPS 2020},
  url = {https://arxiv.org/abs/2006.01112},
  eprint = {2006.01112},
  archivePrefix = {arXiv}
}
```
