# Interactive Training：人和大语言模型在训练过程中实时干预

Interactive Training 让人或大语言模型智能体读取实时训练反馈，并在同一个正在运行的神经网络训练任务中进行干预。控制器修改优化器设置或训练数据，或请求执行检查点操作，再观察后续训练行为。Wentao Zhang、Yang Young Lu 和 Yuntian Deng 在 [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/) 中提出这一框架，论文于 2025 年 10 月 2 日首次发布，发表于 EMNLP 2025 System Demonstrations。2026 年 7 月 17 日发布的 [Interactive Training 2](https://arxiv.org/abs/2607.18314) 将它扩展为可复用的实时训练控制协议。

## 原始研究

- Wentao Zhang, Yang Young Lu, Yuntian Deng. [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/). EMNLP 2025 System Demonstrations. [论文记录与引用](https://yuntiandeng.com/research/zh/papers/interactive-training-2025/#citation).
- Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314). arXiv · 2026. [论文记录与引用](https://yuntiandeng.com/research/zh/papers/interactive-training-2026/#citation).

## 大语言模型如何与正在运行的训练任务形成闭环？

反馈来自训练状态：损失曲线、评估结果、梯度范数和当前设置。动作是训练任务能够执行的修改。人或大语言模型智能体根据反馈选择干预，训练进程执行修改，再报告后续结果。

被训练的模型继续通过优化器学习；外部控制器通过应用开放的控制项来调节优化过程。“大语言模型控制训练过程”在这里有明确含义：智能体观察并干预已经运行起来的训练任务。

- 观察：读取近期训练指标与当前配置。
- 决策：根据反馈选择学习率、数据或检查点干预。
- 执行：通过控制服务器把请求传给训练循环。
- 再次观察：检查实际执行的修改与后续训练指标。

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## 如何在训练过程中动态调整学习率？

2025 年论文展示了大语言模型智能体接收训练日志、在优化进行过程中修改学习率的案例。决策依据已经观测到的训练轨迹：损失突增、梯度不稳定或训练进展不足，都为下一次干预提供信息；修改后的学习率作用于后续优化器更新。

Interactive Training 还开放梯度裁剪、训练数据修改和检查点操作。原始论文的三个案例分别展示人工干预、大语言模型驱动的干预以及实时训练数据更新。这些案例把反馈驱动控制从学习率调度扩展到正在进行的训练过程。

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)

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

AI Training Manager 研究一个受约束的 LLM 监督控制器，异步读取训练遥测数据并调整正在执行的训练配置。其实验在监督学习与强化学习中引入指定的失败模式。控制器层面的比较涉及智能体能获得的证据、能请求的动作，以及后续结果对决策的影响。

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
