# Interactive Training: Feedback-Driven Neural Network Optimization

Wentao Zhang, Yang Young Lu, Yuntian Deng. EMNLP 2025 System Demonstrations (2025).

一个开源框架，让人和 AI 智能体通过控制服务器干预正在进行的神经网络训练，修改优化器设置、训练数据和模型检查点。

原始 Interactive Training 系统将实时监控与对运行中训练过程的反馈控制连接起来。

## 原文摘要（英文）

Traditional neural network training typically follows fixed, predefined optimization recipes, lacking the flexibility to dynamically respond to instabilities or emerging training issues. In this paper, we introduce Interactive Training, an open-source framework that enables real-time, feedback-driven intervention during neural network training by human experts or automated AI agents. At its core, Interactive Training uses a control server to mediate communication between users or agents and the ongoing training process, allowing users to dynamically adjust optimizer hyperparameters, training data, and model checkpoints. Through three case studies, we demonstrate that Interactive Training achieves superior training stability, reduced sensitivity to initial hyperparameters, and improved adaptability to evolving user needs, paving the way toward a future training paradigm where AI agents autonomously monitor training logs, proactively resolve instabilities, and optimize training dynamics.

[论文原文](https://aclanthology.org/2025.emnlp-demos.65/)

## 引用

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
