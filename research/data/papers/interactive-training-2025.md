# Interactive Training: Feedback-Driven Neural Network Optimization

Wentao Zhang, Yang Young Lu, Yuntian Deng. EMNLP 2025 System Demonstrations (2025).

An open-source framework in which humans and AI agents intervene in ongoing neural-network training through a control server, changing optimizer settings, training data, and model checkpoints.

The original Interactive Training system connects live monitoring with feedback-driven control of a running training process.

## Abstract

Traditional neural network training typically follows fixed, predefined optimization recipes, lacking the flexibility to dynamically respond to instabilities or emerging training issues. In this paper, we introduce Interactive Training, an open-source framework that enables real-time, feedback-driven intervention during neural network training by human experts or automated AI agents. At its core, Interactive Training uses a control server to mediate communication between users or agents and the ongoing training process, allowing users to dynamically adjust optimizer hyperparameters, training data, and model checkpoints. Through three case studies, we demonstrate that Interactive Training achieves superior training stability, reduced sensitivity to initial hyperparameters, and improved adaptability to evolving user needs, paving the way toward a future training paradigm where AI agents autonomously monitor training logs, proactively resolve instabilities, and optimize training dynamics.

[Original paper](https://aclanthology.org/2025.emnlp-demos.65/)

## Citation

```bibtex
@inproceedings{zhang-etal-2025-interactive,
  title = {{Interactive Training: Feedback-Driven Neural Network Optimization}},
  author = {Zhang, Wentao and Lu, Yang Young and Deng, Yuntian},
  year = {2025},
  booktitle = {EMNLP 2025 System Demonstrations},
  url = {https://aclanthology.org/2025.emnlp-demos.65/},
  eprint = {2510.02297},
  archivePrefix = {arXiv},
  doi = {10.18653/v1/2025.emnlp-demos.65}
}
```
