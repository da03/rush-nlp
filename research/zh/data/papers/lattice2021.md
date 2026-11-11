# Sequence-to-Lattice Models for Fast Translation

Yuntian Deng, Alexander M. Rush. Findings of EMNLP 2021 (2021).

用候选查找、并行条件边打分和精确 Viterbi 解码取代深层翻译解码器。

其“候选—边—路径”架构连接了连贯的并行草稿生成；其目标与推断方式不同于投机解码中的前缀选择。

## 原文摘要（英文）

Non-autoregressive machine translation (NAT) approaches enable fast generation by utilizing parallelizable generative processes. The remaining bottleneck in these models is their decoder layers; unfortunately unlike in autoregressive models (Kasai et al., 2020), removing decoder layers from NAT models significantly degrades accuracy. This work proposes a sequence-to-lattice model that replaces the decoder with a search lattice. Our approach first constructs a candidate lattice using efficient lookup operations, generates lattice scores from a deep encoder, and finally finds the best path using dynamic programming. Experiments on three machine translation datasets show that our method is faster than past non-autoregressive generation approaches, and more accurate than naively reducing the number of decoder layers.

[论文原文](https://aclanthology.org/2021.findings-emnlp.318/)

## 引用

```bibtex
@inproceedings{deng-rush-2021-sequence,
  title = {{Sequence-to-Lattice Models for Fast Translation}},
  author = {Deng, Yuntian and Rush, Alexander M.},
  year = {2021},
  booktitle = {Findings of EMNLP 2021},
  url = {https://aclanthology.org/2021.findings-emnlp.318/},
  doi = {10.18653/v1/2021.findings-emnlp.318}
}
```
