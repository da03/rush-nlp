# 语言模型与结构化学习：中文研究导读

- [大语言模型决策树：从 Tree Prompting 到智能体分类](https://yuntiandeng.com/research/zh/llm-decision-trees/) — Tree Prompting 如何学习由语言模型提示调用组成的决策树，以及它与 Aug-Tree、GPTree 和 Agentic Classification Tree 的联系。
- [基于能量的文本生成：残差模型、重采样与扩散](https://yuntiandeng.com/research/zh/energy-based-text-generation/) — Residual Energy-Based Models for Text Generation 将序列级能量、噪声对比估计和重要性重采样联系起来，并与基于能量的扩散语言模型直接相连。
- [结构化解码：高阶 CRF、扩散语言模型与候选格](https://yuntiandeng.com/research/zh/structured-decoding/) — Cascaded Text Generation 和 Sequence-to-Lattice 如何连接高阶条件随机场、联合扩散解码，以及用于投机生成的候选格。
- [把注意力建模为隐变量：学习注意力的概率分布](https://yuntiandeng.com/research/zh/probabilistic-attention/) — Latent Alignment and Variational Attention：注意力的概率分布、类别与狄利克雷对齐、边缘化和后验推断。
- [如何评估长文本的结构](https://yuntiandeng.com/research/zh/long-form-evaluation/) — 潜在空间中的模型检验如何超越词元层面的流畅度，评估生成文本的篇章结构、实体行为与主题关系。
- [学习渲染 LaTeX、SMILES、HTML 与乐谱](https://yuntiandeng.com/research/zh/learned-rendering/) — 用扩散模型学习渲染数学公式、分子、表格布局和乐谱，并通过 Scheduled Sampling 处理暴露偏差。
- [让人和 AI 智能体控制正在运行的训练任务](https://yuntiandeng.com/research/zh/interactive-training/) — Interactive Training 将实时指标与人和 LLM 对训练任务的干预相连；第二版加入带类型的控制项和有序操作日志。

## 论文

### Tree Prompting: Efficient Task Adaptation without Fine-Tuning

John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. EMNLP 2023.

学习可重复使用的决策树，其内部判断由接收提示词的语言模型调用完成；候选提示包括少样本示例、指令和动态生成的提示。

基于提示的决策树原始工作：通过修改树结构和提示词适配任务，同时保持语言模型参数不变。

[论文原文](https://arxiv.org/html/2310.14034v1) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/tree-prompting/)

### Augmenting interpretable models with large language models during training

Chandan Singh, Armin Askari, Rich Caruana, Jianfeng Gao. Nature Communications 14, 7913.

Aug-Tree 使用语言模型生成的扩展内容，为树的划分构造可解释文本特征。

与 Tree Prompting 遍历树时调用语言模型的方式不同，它在训练阶段完成特征扩展。

[论文原文](https://www.nature.com/articles/s41467-023-43713-1) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/aug-tree/)

### GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees

Sichao Xiong, Yigit Ihlamur, Fuat Alican, Aaron Ontoyin Yin. arXiv:2411.08257.

使用语言模型辅助的划分构建决策树，并结合专家反馈修改决策路径。

后续的大语言模型决策树系统，支持专家交互及多种划分类型。

[论文原文](https://arxiv.org/html/2411.08257v1) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/gptree/)

### ACT: Agentic Classification Tree

Vincent Grari, Tim Arni, Thibault Laugel, Sylvain Lamprier, James Zou, Marcin Detyniecki. arXiv:2509.26433.

通过基于不纯度的划分选择与 TextGrad 优化，学习由自然语言二元问题组成的分类树。

后续以智能体方式学习问题决策树的工作，将问题优化与树结构学习结合。

[论文原文](https://arxiv.org/html/2509.26433v4) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/act/)

### Residual Energy-Based Models for Text Generation

Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. ICLR 2020.

将固定的自回归语言模型与学到的序列级能量结合，使用 NCE 训练、基于重要性重采样的条件生成，以及似然上下界。

原始文本生成与评估框架，将序列级残差能量与采用能量修正的扩散解码联系起来。

[论文原文](https://arxiv.org/html/2004.11714v1) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/residual-ebm/)

### Residual Energy-Based Models for Text

Anton Bakhtin, Yuntian Deng, Sam Gross, Myle Ott, Marc’Aurelio Ranzato, Arthur Szlam. JMLR 22(40):1–41.

研究如何从统计上区分人类文本与模型文本，并把学到的判别器用于全局归一化生成。

进一步讨论从判别器到生成器的联系，以及残差能量建模。

[论文原文](https://www.jmlr.org/papers/v22/20-326.html) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/residual-ebm-jmlr/)

### Energy-Based Diffusion Language Models for Text Generation

Minkai Xu, Tomas Geffner, Karsten Kreis, Weili Nie, Yilun Xu, Jure Leskovec, Stefano Ermon, Arash Vahdat. ICLR 2025.

在每一步扩散去噪分布中加入完整序列的残差能量，采用自回归模型或 NCE 参数化，并通过并行重要性采样生成文本。

直接引用 Deng 等人（2020），将残差修正与配分函数估计用于扩散语言建模。

[论文原文](https://arxiv.org/html/2410.21357v4) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/edlm/)

### Unified Energy for Invariant and Independent Decoding in Diffusion Language Models

Yuchen Yan, Minkai Xu, Zaiquan Yang, Yatao Bian. arXiv:2606.09159.

结合针对扩散解码中依赖关系与不变性的能量修正。

通过统一处理解码误差，扩展当前采用能量修正的扩散研究方向。

[论文原文](https://arxiv.org/html/2606.09159v1) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/unified-energy/)

### Learning Neural Trans-Dimensional Random Field Language Models with Noise-Contrastive Estimation

Bin Wang, Zhijian Ou. ICASSP 2018.

对参考分布进行指数倾斜，并用噪声对比估计训练神经随机场语言模型。

2020 年论文明确讨论的更早残差形式与 NCE 训练方法，其评估以语音识别重评分为中心。

[论文原文](https://arxiv.org/abs/1710.10739) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/neural-trf-nce/)

### Cascaded Text Generation with Markov Transformers

Yuntian Deng, Alexander M. Rush. NeurIPS 2020.

用于并行文本生成的高阶 CRF 级联模型，由一个 Markov Transformer 统一参数化。

在保持结构化推断可计算的同时增强输出依赖，与扩散解码内部的联合建模相连接。

[论文原文](https://arxiv.org/abs/2006.01112) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/cascaded2020/)

### Sequence-to-Lattice Models for Fast Translation

Yuntian Deng, Alexander M. Rush. Findings of EMNLP 2021.

用候选查找、并行条件边打分和精确 Viterbi 解码取代深层翻译解码器。

其“候选—边—路径”架构连接了连贯的并行草稿生成；其目标与推断方式不同于投机解码中的前缀选择。

[论文原文](https://aclanthology.org/2021.findings-emnlp.318/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/lattice2021/)

### Fast Structured Decoding for Sequence Models

Zhiqing Sun, Zhuohan Li, Haoqing Wang, Di He, Zi Lin, Zhi-Hong Deng. NeurIPS 2019.

为非自回归序列模型加入近似一阶 CRF 推断和动态转移。

一阶结构化解码的参考工作；Cascaded Text Generation 发展了高阶级联和共享的 Markov Transformer 势函数。

[论文原文](https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/sun2019/)

### Breaking the Factorization Barrier in Diffusion Language Models

Ian Li, Zilei Shao, Benjie Wang, Rose Yu, Guy Van den Broeck, Anji Liu. ICML 2026.

CoDD 将因子化扩散预测与可进行高效推断的概率电路先验组合，建模 token 之间的联合依赖。

与结构化生成一样，将并行神经网络打分和联合概率推断分开处理。

[论文原文](https://proceedings.mlr.press/v306/li26fd.html) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/codd2026/)

### DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models

Pengyu Ji, Zichen Zhang, Xiang Hu, Kewei Tu. EMNLP 2026.

通过按输出位置组织的候选组和已确定 token 构成的锚点，把有向无环图依赖建模用于迭代扩散。

把非自回归翻译中的结构化输出建模直接迁移到扩散去噪。

[论文原文](https://aclanthology.org/2026.emnlp-main.2094/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/dadlm2026/)

### LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding

Matan Rusanovsky, Yoav Miron, Roy Uziel, Omer Belhasin, Hao Guo, Ran Zilberstein, Maor Ashkenazi, Michael Elad. arXiv 2026.

对并行草稿的 top-K 候选计算相邻兼容性，再通过低开销的贪心路径选择得到草稿。

采用“候选—边—路径”结构，并使用针对投机解码前缀接受目标的局部训练与推断。

[论文原文](https://arxiv.org/abs/2608.20530) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/lilicorr2026/)

### DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding

Guanghao Li, Zhihui Fu, Min Fang, Qibin Zhao, Ming Tang, Chun Yuan, Jun Wang. Findings of ACL 2026.

结合扩散草稿生成、token 候选格上的 Causal-consistency Path Search，以及自适应草稿长度。

把候选格路径选择与对并行扩散提议的自回归验证相连接。

[论文原文](https://aclanthology.org/2026.findings-acl.1048/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/diffuspec2026/)

### Latent Alignment and Variational Attention

Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, Alexander M. Rush. NeurIPS 2018.

将对齐建模为隐变量，并通过变分注意力学习近似后验推断。

对注意力建立概率分布的一般框架，超越单个确定性注意力向量。

[论文原文](https://arxiv.org/abs/1807.03756) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/latentattention2018/)

### Show, Attend and Tell: Neural Image Caption Generation with Visual Attention

Kelvin Xu, Jimmy Lei Ba, Ryan Kiros, Kyunghyun Cho, Aaron Courville, Ruslan Salakhutdinov, Richard S. Zemel, Yoshua Bengio. ICML 2015.

为图像描述生成引入确定性软视觉注意力和随机硬视觉注意力。

随机注意力的早期参考工作，用于理解期望特征与采样选择之间的区别。

[论文原文](https://proceedings.mlr.press/v37/xuc15.html) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/showattendtell2015/)

### Structured Attention Networks

Yoon Kim, Carl Denton, Luong Hoang, Alexander M. Rush. ICLR 2017.

使用可微图模型推断，对子序列和句法树进行注意力计算。

建模结构化选择并计算期望表示；对完整预测进行边缘化是不同的操作。

[论文原文](https://arxiv.org/abs/1702.00887) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/structuredattention2017/)

### Variational Attention for Sequence-to-Sequence Models

Hareesh Bahuleyan, Lili Mou, Olga Vechtomova, Pascal Poupart. COLING 2018.

在变分编码器—解码器中，把注意力上下文向量视为高斯隐变量。

说明“变分注意力”这一名称也用于另一个随机对象：上下文向量。

[论文原文](https://aclanthology.org/C18-1142/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/bahuleyan2018/)

### Bayesian Attention Modules

Xinjie Fan, Shujian Zhang, Bo Chen, Mingyuan Zhou. NeurIPS 2020.

由归一化的可重参数化随机变量构造注意力权重分布，并使用贝叶斯正则化学习。

把概率注意力发展为带有数据依赖先验的模块化随机权重。

[论文原文](https://arxiv.org/abs/2010.10604) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/bayesianattention2020/)

### Model Criticism for Long-Form Text Generation

Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. EMNLP 2022.

通过在显式生成式检验模型定义的潜在空间中比较真实数据与生成数据，评估文本的高层结构。实验研究篇章连贯性、共指和主题性。

诊断生成文本结构分布的原始框架，将结构评估与词元层面的流畅度分开。

[论文原文](https://aclanthology.org/2022.emnlp-main.815/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/model-criticism/)

### OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics

Jian Guan, Zhexin Zhang, Zhuoer Feng, Zitao Liu, Wenbiao Ding, Xiaoxi Mao, Changjie Fan, Minlie Huang. ACL-IJCNLP 2021.

检验自动故事评估指标的基准，涵盖与人工判断的相关性、泛化、稳健性，以及对不同连贯性错误的敏感程度。

检验评估器能否发现已知的故事缺陷，与在潜在空间中诊断生成器输出分布的方法互补。

[论文原文](https://aclanthology.org/2021.acl-long.500/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/openmeva/)

### What Makes a Good Story and How Can We Measure It? A Comprehensive Survey of Story Evaluation

Dingyi Yang, Qin Jin. arXiv.

综述故事质量标准、人工评估、自动指标和评估基准。

将结构诊断放在连贯性、人物发展与叙事质量的更广泛评估背景中。

[论文原文](https://arxiv.org/abs/2408.14622) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/story-evaluation-survey/)

### Markup-to-Image Diffusion Models with Scheduled Sampling

Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. ICLR 2023.

通过条件扩散学习渲染 LaTeX、HTML 表格布局、LilyPond 乐谱和 SMILES 分子。Scheduled Sampling 让去噪器接触自己生成的输入，以处理逐步累积的错误。

原始扩散式标记语言到图像方法，以及覆盖四个领域的渲染基准。

[论文原文](https://arxiv.org/abs/2210.05147) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/markup-diffusion/)

### Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation

Guojin Zhong, Jin Yuan, Pan Wang, Kailun Yang, Weili Guan, Zhiyong Li. ACM Multimedia 2023.

FSA-CDM 将细粒度跨模态序列对齐、上下文建模和对比增强的扩散目标结合，用于标记语言到图像生成。

这项后续工作沿用 Deng、Kojima 和 Rush 提出的任务与四个数据集，研究对齐与对比反馈。

[论文原文](https://arxiv.org/abs/2308.01147) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/fsa-cdm/)

### Input Perturbation Reduces Exposure Bias in Diffusion Models

Mang Ning, Enver Sangineto, Angelo Porrello, Simone Calderara, Rita Cucchiara. ICML 2023.

研究扩散模型采样过程中累积的错误，并在训练中扰动输入，以模拟推理时的预测误差。

通过合成输入扰动处理同一种训练与采样不匹配问题；Scheduled Sampling 则在模型生成的状态上训练。

[论文原文](https://proceedings.mlr.press/v202/ning23a.html) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/diffusion-input-perturbation/)

### Interactive Training: Feedback-Driven Neural Network Optimization

Wentao Zhang, Yang Young Lu, Yuntian Deng. EMNLP 2025 System Demonstrations.

一个开源框架，让人和 AI 智能体通过控制服务器干预正在进行的神经网络训练，修改优化器设置、训练数据和模型检查点。

原始 Interactive Training 系统将实时监控与对运行中训练过程的反馈控制连接起来。

[论文原文](https://aclanthology.org/2025.emnlp-demos.65/) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/interactive-training-2025/)

### Interactive Training 2: Auditable Control Plane for Live Model Training

Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. arXiv.

可复用的协议，提供带类型的设置、结构化动作、由应用选择的控制点，以及由人、脚本和 LLM 控制器共用的有序日志。

将 2025 年框架从依赖特定 Trainer 的命令接口，扩展为不同训练流程共用的控制协议。

[论文原文](https://arxiv.org/abs/2607.18314) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/interactive-training-2026/)

### LiveTune: Dynamic Parameter Tuning for Feedback-Driven Optimization

Soheil Zibakhsh Shabgahi, Nojan Sheybani, Aiden Tabrizi, Farinaz Koushanfar. arXiv.

LiveVariables 通过指定的系统端口开放优化参数，支持在不重启优化循环的情况下实时调整参数。

更早的实时优化参数调节系统；Interactive Training 将人和智能体的命令接入训练，第二版提供共用的控制协议。

[论文原文](https://arxiv.org/abs/2311.17279) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/livetune/)

### AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes

Anjali Rao, Nikhil Kamalkumar Advani. arXiv.

异步 LLM 监督控制器观察训练遥测数据，对正在执行的训练配置提出受约束的修改，并在刻意引入的监督学习与强化学习失败模式上实验。

研究对正在进行的训练实施自动控制，与 Interactive Training 为人和自动化控制器提供的可复用基础设施互补。

[论文原文](https://arxiv.org/abs/2606.29871) · [论文记录与引用](https://yuntiandeng.com/research/zh/papers/ai-training-manager/)
