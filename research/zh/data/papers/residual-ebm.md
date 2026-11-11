# Residual Energy-Based Models for Text Generation

Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. ICLR 2020 (2020).

将固定的自回归语言模型与学到的序列级能量结合，使用 NCE 训练、基于重要性重采样的条件生成，以及似然上下界。

本指南讨论的原始文本生成与评估框架，将序列级残差能量与当前采用能量修正的扩散解码联系起来。

## 原文摘要（英文）

Text generation is ubiquitous in many NLP tasks, from summarization, to dialogue and machine translation. The dominant parametric approach is based on locally normalized models which predict one word at a time. While these work remarkably well, they are plagued by exposure bias due to the greedy nature of the generation process. In this work, we investigate un-normalized energy-based models (EBMs) which operate not at the token but at the sequence level. In order to make training tractable, we first work in the residual of a pretrained locally normalized language model and second we train using noise contrastive estimation. Furthermore, since the EBM works at the sequence level, we can leverage pretrained bi-directional contextual representations, such as BERT and RoBERTa. Our experiments on two large language modeling datasets show that residual EBMs yield lower perplexity compared to locally normalized baselines. Moreover, generation via importance sampling is very efficient and of higher quality than the baseline models according to human evaluation.

[论文原文](https://arxiv.org/html/2004.11714v1)

## 引用

```bibtex
@inproceedings{residualebm,
  title = {{Residual Energy-Based Models for Text Generation}},
  author = {Deng, Yuntian and Bakhtin, Anton and Ott, Myle and Szlam, Arthur and Ranzato, Marc’Aurelio},
  year = {2020},
  booktitle = {ICLR 2020},
  url = {https://arxiv.org/html/2004.11714v1},
  eprint = {2004.11714},
  archivePrefix = {arXiv}
}
```
