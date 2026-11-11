# Interactive Training 2: Auditable Control Plane for Live Model Training

Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. arXiv (2026).

A reusable protocol with typed settings, structured actions, application-selected control points, and an ordered journal shared by humans, scripts, and LLM controllers.

Extends the 2025 framework from a Trainer-specific command interface to a common control protocol across training workflows.

## Abstract

Experiment trackers show how training is progressing, but changing a live run still usually requires trainer-specific code. We present Interactive Training 2, an open-source control plane for steering training through a shared protocol. Training applications declare which settings and actions they expose, humans and automated controllers submit requests through the same interface, and the training loop validates and applies them at safe control points. A customized Aim workspace combines live metrics and controls with a chronological record of requests and outcomes. We demonstrate the system across five NLP and reinforcement-learning workflows. The released code and traces provide a reusable foundation for auditable human- and agent-guided training.

[Original paper](https://arxiv.org/abs/2607.18314)

## Citation

```bibtex
@misc{article_number,
  title = {{Interactive Training 2: Auditable Control Plane for Live Model Training}},
  author = {Zhang, Wentao and Pan, Xuanhe and Zhou, Han and Lu, Yang and Deng, Yuntian},
  year = {2026},
  url = {https://arxiv.org/abs/2607.18314},
  eprint = {2607.18314},
  archivePrefix = {arXiv},
  doi = {10.48550/arXiv.2607.18314}
}
```
