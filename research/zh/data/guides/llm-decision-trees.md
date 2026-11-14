# 大语言模型决策树：从 Tree Prompting 到智能体分类

Tree Prompting（EMNLP 2023）学习一棵决策树，由接收提示词的语言模型完成每个节点的分支判断。学到的提示词与控制流程共同构成可重复用于分类任务的程序。这一机制直接连接了今天的大语言模型决策树、自然语言问题树和智能体分类。

## Tree Prompting 提出了什么

John X. Morris、Chandan Singh、Alexander M. Rush、Jianfeng Gao 和 Yuntian Deng 在 EMNLP 2023 发表了 Tree Prompting；Morris 与 Singh 的贡献相同。预印本于 2023 年 10 月 21 日公开。每个内部节点让冻结参数的语言模型执行一条提示，再根据输出选择分支，最终由叶节点给出预测。

这棵树从带标签的样本中学习。候选提示包括采样得到的示例、指令以及动态生成的提示。在动态版本中，iPrompt 针对到达当前节点的样本生成候选提示，再根据划分质量选出提示。节点提出的问题与树的分支结构都从数据中学习得到。

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## 把提示树理解为程序

在一个客服消息分类示例中，第一个节点询问消息是否要求退款；如果回答“是”，第二个节点再询问消息是否涉及重复扣款。这条路径返回账单类标签；回答“否”则进入树的其他部分。这个固定示例展示控制流程；论文中的树则从数据中学习。

这个程序由条件、分支和返回值组成。传统条件检查数值阈值或精确字符串；基于提示的条件让语言模型按指令理解输入。指令规定要问什么，语言模型给出针对当前输入的判断。

路径日志能区分三种错误：节点问了无关的问题；问题相关，但模型回答错误；前面的判断都正确，叶节点却分配了错误类别。记录实际经过的路径，就能区分这些错误。


## 学习哪些内容，预测需要多少计算

任务适配体现在选出的提示词和树结构中，无需更新语言模型权重。当每个节点的特征需要一次模型调用时，深度为 D 的路径需要 D 次调用，无需遍历整棵树。原始代码提供了兼容 scikit-learn 风格的分类器接口。

训练决策树的开销与预测开销应分别衡量。训练时搜索候选问题，并在带标签的输入上评估它们；部署时执行保留下来的决策路径。因此，搜索阶段投入大量计算，并不意味着每次预测都要付出同样的开销。

实现时需要明确标签集合、输出解析方式、停止规则，以及模型输出无效答案时的处理方式。除准确率外，还应测量平均路径长度和 token 用量。两棵深度相同的树，如果提示中包含的示例数量不同，计算开销也不同。保存训练好的提示词和树时，应同时记录模型版本：更换语言模型会改变这些可执行条件的含义。

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## 比较语言模型在系统中承担的角色

Aug-Tree 在训练时使用大语言模型扩展文本特征，部署后通过可解释的特征检查完成预测，无需调用语言模型。GPTree 构建由大语言模型支持的决策树，并允许专家通过反馈修改决策路径。ACT 则通过基于不纯度的选择与 TextGrad 优化，学习自然语言二元问题。

这些区别对应不同的设计选择：生成特征、回答语义问题、搜索更好的问题，以及修改得到的程序。

| 方法 | 节点或划分方式 | 语言模型的作用 |
| --- | --- | --- |
| Tree Prompting · 2023 | 在输入上执行学到的提示词 | 执行分支判断；动态版本还生成提示词 |
| Aug-Tree · 2023；预印本 2022 | 扩展文本特征的逻辑或组合 | 在训练期间构造特征 |
| GPTree · 2024 | 语言模型辅助的决策规则与划分类型 | 构建决策，并结合专家反馈修改 |
| ACT · 2025 | 学到的自然语言二元问题 | 提出、评估并优化问题 |

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)
- [Augmenting interpretable models with large language models during training](https://www.nature.com/articles/s41467-023-43713-1)
- [GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees](https://arxiv.org/html/2411.08257v1)
- [ACT: Agentic Classification Tree](https://arxiv.org/html/2509.26433v4)

## 什么任务适合学习问题树

当任务具有可重复使用的决策结构，而且带标签的样本能揭示哪些区分最重要时，这种设计就有用。意图路由、文档分类和归类任务都适合逐步提出语义问题。树把任务专属的结构保存在模型权重之外。

选择不同的示例消息，查看它们经过固定树的路径。训练分类器时，使用原论文和代码，在训练样本上拟合，在验证集上选择树的大小，再用留出的样本评估保存下来的树。


## 运行原始 Tree Prompting 笔记本

作者的[原始笔记本](https://github.com/csinva/tree-prompt/blob/master/demo.ipynb)使用 GPT-2 和 Rotten Tomatoes 样本拟合 TreePromptClassifier，预测留出样本的标签，比较单条提示词，并通过 plot_tree 绘制学到的树。请按[代码仓库的安装说明](https://github.com/csinva/tree-prompt)准备环境；该笔记本会下载模型和数据集。

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## 参考文献

- John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. Tree Prompting: Efficient Task Adaptation without Fine-Tuning. EMNLP 2023. https://arxiv.org/html/2310.14034v1
- Chandan Singh, Armin Askari, Rich Caruana, Jianfeng Gao. Augmenting interpretable models with large language models during training. Nature Communications 14, 7913. https://www.nature.com/articles/s41467-023-43713-1
- Sichao Xiong, Yigit Ihlamur, Fuat Alican, Aaron Ontoyin Yin. GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees. arXiv:2411.08257. https://arxiv.org/html/2411.08257v1
- Vincent Grari, Tim Arni, Thibault Laugel, Sylvain Lamprier, James Zou, Marcin Detyniecki. ACT: Agentic Classification Tree. arXiv:2509.26433. https://arxiv.org/html/2509.26433v4
