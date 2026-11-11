# Model Criticism for Long-Form Text Generation

Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. EMNLP 2022 (2022).

通过在显式生成式检验模型定义的潜在空间中比较真实数据与生成数据，评估文本的高层结构。实验研究篇章连贯性、共指和主题性。

诊断生成文本结构分布的原始框架，将结构评估与词元层面的流畅度分开。

## 原文摘要（英文）

Language models have demonstrated the ability to generate highly fluent text; however, it remains unclear whether their output retains coherent high-level structure (e.g., story progression). Here, we propose to apply a statistical tool, model criticism in latent space, to evaluate the high-level structure of the generated text. Model criticism compares the distributions between real and generated data in a latent space obtained according to an assumptive generative process. Different generative processes identify specific failure modes of the underlying model. We perform experiments on three representative aspects of high-level discourse—coherence, coreference, and topicality—and find that transformer-based language models are able to capture topical structures but have a harder time maintaining structural coherence or modeling coreference.

[论文原文](https://aclanthology.org/2022.emnlp-main.815/)

## 引用

```bibtex
@inproceedings{deng-etal-2022-model,
  title = {{Model Criticism for Long-Form Text Generation}},
  author = {Deng, Yuntian and Kuleshov, Volodymyr and Rush, Alexander M.},
  year = {2022},
  booktitle = {EMNLP 2022},
  url = {https://aclanthology.org/2022.emnlp-main.815/},
  eprint = {2210.08444},
  archivePrefix = {arXiv},
  doi = {10.18653/v1/2022.emnlp-main.815}
}
```
