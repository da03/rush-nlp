# Model Criticism for Long-Form Text Generation

Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. EMNLP 2022 (2022).

A framework for evaluating high-level text structure by comparing real and generated data in latent spaces defined by explicit generative critics. Experiments study discourse coherence, coreference, and topicality.

The original framework for diagnosing structural distributions in generated text, separate from word-level fluency.

## Abstract

Language models have demonstrated the ability to generate highly fluent text; however, it remains unclear whether their output retains coherent high-level structure (e.g., story progression). Here, we propose to apply a statistical tool, model criticism in latent space, to evaluate the high-level structure of the generated text. Model criticism compares the distributions between real and generated data in a latent space obtained according to an assumptive generative process. Different generative processes identify specific failure modes of the underlying model. We perform experiments on three representative aspects of high-level discourse—coherence, coreference, and topicality—and find that transformer-based language models are able to capture topical structures but have a harder time maintaining structural coherence or modeling coreference.

[Original paper](https://aclanthology.org/2022.emnlp-main.815/)

## Citation

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
