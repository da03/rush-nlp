# Residual Energy-Based Models for Text Generation

Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. ICLR 2020 (2020).

Combines a fixed autoregressive language model with a learned sequence-level energy, NCE training, conditional generation by importance resampling, and likelihood bounds.

Original text-generation and evaluation framework connecting sequence-level residual energies to modern energy-corrected diffusion decoding.

## Abstract

Text generation is ubiquitous in many NLP tasks, from summarization, to dialogue and machine translation. The dominant parametric approach is based on locally normalized models which predict one word at a time. While these work remarkably well, they are plagued by exposure bias due to the greedy nature of the generation process. In this work, we investigate un-normalized energy-based models (EBMs) which operate not at the token but at the sequence level. In order to make training tractable, we first work in the residual of a pretrained locally normalized language model and second we train using noise contrastive estimation. Furthermore, since the EBM works at the sequence level, we can leverage pretrained bi-directional contextual representations, such as BERT and RoBERTa. Our experiments on two large language modeling datasets show that residual EBMs yield lower perplexity compared to locally normalized baselines. Moreover, generation via importance sampling is very efficient and of higher quality than the baseline models according to human evaluation.

[Original paper](https://arxiv.org/html/2004.11714v1)

## Citation

```bibtex
@inproceedings{article_number,
  title = {{Residual Energy-Based Models for Text Generation}},
  author = {Deng, Yuntian and Bakhtin, Anton and Ott, Myle and Szlam, Arthur and Ranzato, Marc’Aurelio},
  year = {2020},
  booktitle = {ICLR 2020},
  url = {https://arxiv.org/html/2004.11714v1},
  eprint = {2004.11714},
  archivePrefix = {arXiv}
}
```
