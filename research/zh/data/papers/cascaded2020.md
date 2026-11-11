# Cascaded Text Generation with Markov Transformers

Yuntian Deng, Alexander M. Rush. NeurIPS 2020 (2020).

用于并行文本生成的高阶 CRF 级联模型，由一个 Markov Transformer 统一参数化。

在保持结构化推断可计算的同时增强输出依赖，与扩散解码内部的联合建模相连接。

## 原文摘要（英文）

The two dominant approaches to neural text generation are fully autoregressive models, using serial beam search decoding, and non-autoregressive models, using parallel decoding with no output dependencies. This work proposes an autoregressive model with sub-linear parallel time generation. Noting that conditional random fields with bounded context can be decoded in parallel, we propose an efficient cascaded decoding approach for generating high-quality output. To parameterize this cascade, we introduce a Markov transformer, a variant of the popular fully autoregressive model that allows us to simultaneously decode with specific autoregressive context cutoffs. This approach requires only a small modification from standard autoregressive training, while showing competitive accuracy/speed tradeoff compared to existing methods on five machine translation datasets.

[论文原文](https://arxiv.org/abs/2006.01112)

## 引用

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
