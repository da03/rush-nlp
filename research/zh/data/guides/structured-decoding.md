# 结构化解码：高阶 CRF、扩散语言模型与候选格

神经网络的并行计算不要求各个输出独立决策。Yuntian Deng 和 Alexander M. Rush 在 Cascaded Text Generation with Markov Transformers（NeurIPS 2020）中提出了用于文本生成的高阶 CRF 级联模型，又在 Sequence-to-Lattice Models for Fast Translation（Findings of EMNLP 2021）中发展了结合精确路径搜索的候选格生成。这些贡献连接了今天的两个问题：建模扩散语言模型同时生成的 token 之间的依赖，以及从并行 token 候选中选出连贯的草稿。

## 为什么并行预测需要联合决策

考虑两个正确的英语续写：“the dog runs”和“the dogs run”。如果每个位置独立选择，也会组合出“the dog run”。更好的表示能够帮助网络预测各个位置的边缘分布，但边缘分布的乘积仍无法表达名词与动词必须保持一致。显式联合模型对组合打分，把兼容性纳入输出分布和解码过程。

这里有两个独立的设计问题：开销较大的神经网络分数如何计算，以及最终序列如何选择。大量备选项的分数可以并行计算，再由一个小型结构化推断算法组合。Sun 等人的 Fast Structured Decoding for Sequence Models（NeurIPS 2019）将非自回归发射分数与近似一阶 CRF、动态转移结合。高阶上下文、逐级剪枝和候选格构建则提供了进一步的设计选择。

- [Fast Structured Decoding for Sequence Models](https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html)
- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)

## 高阶 CRF：Cascaded Text Generation with Markov Transformers

Cascaded Text Generation 引入了马尔可夫阶数逐级增加的一系列条件随机场（CRF）。模型从独立 token 分数开始，逐渐加入跨越更长片段的依赖。一个 Markov Transformer 通过受控的上下文窗口，为各个阶数提供势函数。最大边缘值（max-marginal）用包含某个片段的最佳完整序列为该片段打分；进入表达能力更强的下一阶段之前，剪枝保留高分片段。

这一贡献结合了高阶输出依赖、共享的神经网络参数化，以及并行结构化推断，与 Sun 等人的一阶动态 CRF 不同。当保留状态的宽度固定时，其并行动态规划计算深度随序列长度呈对数增长。

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Fast Structured Decoding for Sequence Models](https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html)

## 从高阶 CRF 到联合扩散解码

扩散模型反复遇到同样的协调问题：一次去噪步骤中，要同时确定多个尚不明确的 token。它与结构化生成的联系在于一个建模原则：用计算成本可控的联合分布耦合这些决策，同时保留神经网络的并行计算。马尔可夫阶数描述输出位置之间的依赖范围；扩散时间步描述文本从受扰状态逐渐恢复的进程。这是两个不同的维度。

Breaking the Factorization Barrier in Diffusion Language Models（ICML 2026）提出 CoDD，将因子化的神经网络预测与概率电路形式的结构先验结合。实验用隐马尔可夫模型实现这一先验。二者的乘积支持联合推断，无需为所有 token 组合显式建立词表规模的表格。它与结构化生成具有共同目标，但采用隐状态结构和以扩散状态为条件的推断，而不是逐级增加已观测 token 上下文阶数的级联。

DA-DLM（EMNLP 2026）明确连接了这一问题与非自回归翻译。它把有向无环图建模用于迭代去噪：节点组对应输出位置，已经确定的 token 成为锚点，并连接尚未确定的候选。图结构随着去噪过程变化。早期模型把结构化输出建模用于翻译；DA-DLM 则把它放进扩散去噪过程。

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Breaking the Factorization Barrier in Diffusion Language Models](https://proceedings.mlr.press/v306/li26fd.html)
- [DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models](https://aclanthology.org/2026.emnlp-main.2094/)

## 候选格：Sequence-to-Lattice Models for Fast Translation

Sequence-to-Lattice 用候选查找、神经网络边打分和路径搜索取代深层解码器。统计对齐模型为每个输出位置提出一个小型候选词表。深层编码器与浅层打分头并行评估候选之间的转移，再由 Viterbi 算法选择分数最高的完整路径。

论文使用带局部归一化转移概率的一阶条件马尔可夫模型。Viterbi 在构建好的候选格中，对保留下来的候选求得精确最优解。候选构建、边打分和路径搜索分成三个阶段：低成本构造备选项，并行计算相邻候选的兼容性，再搜索得到的图。

- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)

## 从候选格到连贯的投机解码草稿

并行投机解码（speculative decoding，也称推测解码）的草稿生成面临相关问题：每个未来位置都有多个候选，但单独看来最好的选择并不一定能组成有用的草稿。LiLiCorr 保留 top-K 候选，用轻量网络计算入边与出边向量，通过批量运算评估相邻兼容性，再执行贪心路径选择。其训练目标针对被接受的前缀，并联合适配草稿模型与打分头。

它与 Sequence-to-Lattice 的联系在于“候选—边—路径”架构。翻译候选来自基于对齐的查找模型；LiLiCorr 的候选来自并行草稿模型。Sequence-to-Lattice 对完整路径目标执行精确 Viterbi 搜索；LiLiCorr 使用局部归一化和贪心选择，使其服务于前缀接受目标。

DiffuSpec 使用扩散模型并行生成草稿，并在 token 候选格上引入 Causal-consistency Path Search（因果一致性路径搜索），同时根据接受情况的反馈调整草稿长度。这里的图连接双向草稿提议与自回归验证器。候选格规定候选如何组织；打分规则与验证过程则决定路径选择实际完成什么。

- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)
- [LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding](https://arxiv.org/abs/2608.20530)
- [DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding](https://aclanthology.org/2026.findings-acl.1048/)

## 先确定推断目标，再选择图结构

同一张图上的三种运算回答不同的问题。最大化寻找评分最高的完整路径；边缘化对备选状态求和，用于计算概率或训练隐变量模型；采样按照分布抽取序列。即使节点和边完全相同，把其中一种运算换成另一种也会改变算法。

一个小型数值例子能说明区别。假设第一次决策中，A 的概率为 0.6，B 为 0.4。A 后最强续写的条件概率为 0.5，B 后为 0.9。贪心选择先选 A；完整路径最大化则选择 B，因为 0.4 × 0.9 大于 0.6 × 0.5。在投机解码中，目标验证器又引入了新的目标：应衡量被接受的前缀，以及生成它所需的计算开销。

比较实现时，应明确候选集合、边上的依赖、归一化方式和推断运算，再测量主导运行时间的工作：神经网络前向计算、候选打分、动态规划和验证。

| 设计 | 依赖或评分方式 | 最终运算 |
| --- | --- | --- |
| Cascaded generation | 递增的马尔可夫阶数；经过剪枝的片段 | 在保留状态内进行结构化最大化 |
| Sequence-to-Lattice | 一阶条件边概率 | 在候选格上执行精确 Viterbi 搜索 |
| CoDD / DA-DLM | 去噪内部的联合结构 | 以扩散状态为条件的推断 |
| LiLiCorr / DiffuSpec | 兼容性评分或因果草稿路径 | 选择草稿后再验证 |

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)
- [Breaking the Factorization Barrier in Diffusion Language Models](https://proceedings.mlr.press/v306/li26fd.html)
- [DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models](https://aclanthology.org/2026.emnlp-main.2094/)
- [LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding](https://arxiv.org/abs/2608.20530)
- [DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding](https://aclanthology.org/2026.findings-acl.1048/)

## 运行高阶路径搜索示例

下载可独立运行的[联合解码笔记本](https://yuntiandeng.com/research/examples/joint_decoding.ipynb)或 [Python 脚本](https://yuntiandeng.com/research/examples/joint_decoding.py)。一个涉及三个 token 的兼容性因子会改变从小型候选格中选出的序列。最大和动态规划寻找最佳路径，和积运算计算全局归一化常数。

另一个局部归一化示例展示了贪心 token 选择与完整路径 Viterbi 搜索为什么会选择不同的路径。这些示例在固定分数上演示精确结构化推断；原论文提供了上文介绍的神经网络打分、高阶级联、剪枝和候选构建方法。

代码使用 Python 3.9+ 及其标准库运行。[下载全部三个示例及数值检查](https://yuntiandeng.com/research/examples/research-examples.zip)。

- [Cascaded Text Generation with Markov Transformers](https://arxiv.org/abs/2006.01112)
- [Sequence-to-Lattice Models for Fast Translation](https://aclanthology.org/2021.findings-emnlp.318/)

## 参考文献

- Yuntian Deng, Alexander M. Rush. Cascaded Text Generation with Markov Transformers. NeurIPS 2020. https://arxiv.org/abs/2006.01112
- Yuntian Deng, Alexander M. Rush. Sequence-to-Lattice Models for Fast Translation. Findings of EMNLP 2021. https://aclanthology.org/2021.findings-emnlp.318/
- Zhiqing Sun, Zhuohan Li, Haoqing Wang, Di He, Zi Lin, Zhi-Hong Deng. Fast Structured Decoding for Sequence Models. NeurIPS 2019. https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html
- Ian Li, Zilei Shao, Benjie Wang, Rose Yu, Guy Van den Broeck, Anji Liu. Breaking the Factorization Barrier in Diffusion Language Models. ICML 2026. https://proceedings.mlr.press/v306/li26fd.html
- Pengyu Ji, Zichen Zhang, Xiang Hu, Kewei Tu. DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models. EMNLP 2026. https://aclanthology.org/2026.emnlp-main.2094/
- Matan Rusanovsky, Yoav Miron, Roy Uziel, Omer Belhasin, Hao Guo, Ran Zilberstein, Maor Ashkenazi, Michael Elad. LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding. arXiv 2026. https://arxiv.org/abs/2608.20530
- Guanghao Li, Zhihui Fu, Min Fang, Qibin Zhao, Ming Tang, Chun Yuan, Jun Wang. DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding. Findings of ACL 2026. https://aclanthology.org/2026.findings-acl.1048/
