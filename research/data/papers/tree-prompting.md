# Tree Prompting: Efficient Task Adaptation without Fine-Tuning

John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. EMNLP 2023 (2023).

Tree Prompting (EMNLP 2023) learns a decision tree of prompts for text classification without fine-tuning the language model. Training selects prompts and branching structure; inference follows a root-to-leaf path of LM calls.

Original prompt-based decision-tree method: task adaptation changes the tree and prompts while keeping the language model fixed.

## Abstract

Prompting language models (LMs) is the main interface for applying them to new tasks. However, for smaller LMs, prompting provides low accuracy compared to gradient-based fine-tuning. Tree Prompting is an approach to prompting which builds a decision tree of prompts, linking multiple LM calls together to solve a task. At inference time, each call to the LM is determined by efficiently routing the outcome of the previous call using the tree. Experiments on classification datasets show that Tree Prompting improves accuracy over competing methods and is competitive with fine-tuning. We also show that variants of Tree Prompting allow inspection of a model’s decision-making process.

[Original paper](https://arxiv.org/html/2310.14034v1)

## Citation

```bibtex
@inproceedings{treeprompting,
  title = {{Tree Prompting: Efficient Task Adaptation without Fine-Tuning}},
  author = {Morris, John X. and Singh, Chandan and Rush, Alexander M. and Gao, Jianfeng and Deng, Yuntian},
  year = {2023},
  booktitle = {EMNLP 2023},
  url = {https://arxiv.org/html/2310.14034v1},
  eprint = {2310.14034},
  archivePrefix = {arXiv},
  doi = {10.18653/v1/2023.emnlp-main.384}
}
```
