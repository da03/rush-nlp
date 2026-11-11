# 让人和 AI 智能体控制正在运行的训练任务

Wentao Zhang、Yang Young Lu 和 Yuntian Deng 的 Interactive Training: Feedback-Driven Neural Network Optimization 让人和 AI 智能体能够控制正在进行的神经网络训练。论文于 2025 年 10 月 2 日首次发布，发表于 EMNLP 2025 System Demonstrations，通过控制服务器开放优化器设置、训练数据和检查点操作。2026 年 7 月 17 日在 arXiv 发布的 Interactive Training 2 将这一方法扩展为实时训练中可复用的控制协议。

## 把正在运行的训练过程作为控制对象

训练面板展示损失曲线与评估结果；交互式控制则把这些观测与产生它们的训练过程连接起来。研究者看到训练不稳定，修改学习率，再观察同一次运行中的后续更新。LLM 控制器也遵循同样的反馈循环：查看证据、请求干预、再检查干预效果。

这与启动前选择配置，或等一轮训练结束后再设计新实验不同。模型和优化器在继续运行，开放的控制项则在过程中发生变化。从检查点恢复和开启新一轮训练是另外的操作，各自有对应的状态转移；界面应记录实际执行了哪一种操作。

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## 2025 年系统：把监控与干预连接起来

原始框架通过控制服务器连接人或自动化智能体与训练进程。与 Trainer 的集成开放了优化器超参数、数据处理和检查点命令。控制者可以在实时界面中观察训练并提交修改，无需把修改写进静态配置后重新启动程序。

论文展示了三个案例，分别涉及训练稳定性、对初始超参数的敏感性和变化中的用户需求。其中，LLM 驱动的学习率调节示例展示了智能体如何读取反馈并在优化过程中干预。系统把实时观测和控制接口与训练循环连接起来，优化器继续更新模型参数。

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)

## 2026 年扩展：不同控制器共用一个协议

Wentao Zhang、Xuanhe Pan、Han Zhou、Yang Lu 和 Yuntian Deng 的 Interactive Training 2 用可注册的设置与动作，替代固定、依赖特定 Trainer 的命令集合。TrainingSession 开放带类型的控制项及其说明。人、脚本、启发式方法和 LLM 智能体都通过同一个接口提交请求。

训练应用自行选择控制点，在这些位置验证并应用排队中的请求。有序日志把请求与执行结果、评估、检查点和控制器决策关联起来，Aim 工作区则将这些记录与实时指标放在一起。论文还区分了一轮训练内部的干预与跨轮次规划：新一轮会重新初始化模型和优化器，文字日志则把观测与反思传递到后续轮次。

- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## 分别比较机制、控制器和实验

LiveTune 早于 Interactive Training，通过 LiveVariables 在不重启优化循环的情况下修改优化参数，提供了更早的实时参数调节机制。Interactive Training 关注围绕训练展开的人与 AI 智能体工作流程；第二版进一步让控制项与事件记录能够在不同应用间复用。

AI Training Manager 研究一个受约束的 LLM 监督控制器，异步读取训练遥测数据并调整正在执行的训练配置。其实验在监督学习与强化学习中引入指定的失败模式。控制器层面的比较涉及智能体能获得的证据、能请求的动作，以及后续结果对决策的影响。基础设施支持与测得的控制器性能，是不同的贡献。

- [LiveTune: Dynamic Parameter Tuning for Feedback-Driven Optimization](https://arxiv.org/abs/2311.17279)
- [AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes](https://arxiv.org/abs/2606.29871)
- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## 设计能够观察和核查的反馈闭环

开放训练应用实际能够执行的控制项，并定义修改在何时生效。记录触发请求的观测、请求值、实际应用值、生效的训练步数，以及后续测量结果。提交请求与成功完成更新是不同的事件；将两者关联起来，才能检查系统实际做了什么。

在明确的任务负载和预算下，按预先指定的训练目标评估自动化控制器。计算推理与干预开销，保留运行历史，并区分持续运行中的改进与新初始化轮次的结果。

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)
- [AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes](https://arxiv.org/abs/2606.29871)

## 参考文献

- Wentao Zhang, Yang Young Lu, Yuntian Deng. Interactive Training: Feedback-Driven Neural Network Optimization. EMNLP 2025 System Demonstrations. https://aclanthology.org/2025.emnlp-demos.65/
- Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. Interactive Training 2: Auditable Control Plane for Live Model Training. arXiv. https://arxiv.org/abs/2607.18314
- Soheil Zibakhsh Shabgahi, Nojan Sheybani, Aiden Tabrizi, Farinaz Koushanfar. LiveTune: Dynamic Parameter Tuning for Feedback-Driven Optimization. arXiv. https://arxiv.org/abs/2311.17279
- Anjali Rao, Nikhil Kamalkumar Advani. AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes. arXiv. https://arxiv.org/abs/2606.29871
