# Interactive Training 2: Auditable Control Plane for Live Model Training

Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. arXiv (2026).

可复用的协议，提供带类型的设置、结构化动作、由应用选择的控制点，以及由人、脚本和 LLM 控制器共用的有序日志。

将 2025 年框架从依赖特定 Trainer 的命令接口，扩展为不同训练流程共用的控制协议。

## 原文摘要（英文）

Experiment trackers show how training is progressing, but changing a live run still usually requires trainer-specific code. We present Interactive Training 2, an open-source control plane for steering training through a shared protocol. Training applications declare which settings and actions they expose, humans and automated controllers submit requests through the same interface, and the training loop validates and applies them at safe control points. A customized Aim workspace combines live metrics and controls with a chronological record of requests and outcomes. We demonstrate the system across five NLP and reinforcement-learning workflows. The released code and traces provide a reusable foundation for auditable human- and agent-guided training.

[论文原文](https://arxiv.org/abs/2607.18314)

## 引用

```bibtex
@misc{zhang2026interactivetraining2,
  title = {{Interactive Training 2: Auditable Control Plane for Live Model Training}},
  author = {Zhang, Wentao and Pan, Xuanhe and Zhou, Han and Lu, Yang and Deng, Yuntian},
  year = {2026},
  url = {https://arxiv.org/abs/2607.18314},
  eprint = {2607.18314},
  archivePrefix = {arXiv},
  doi = {10.48550/arXiv.2607.18314}
}
```
