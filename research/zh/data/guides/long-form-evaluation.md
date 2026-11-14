# 如何评估长文本的结构

一段话读起来流畅，并不代表整篇文档结构连贯。Yuntian Deng、Volodymyr Kuleshov 和 Alexander M. Rush 的 Model Criticism for Long-Form Text Generation 提出了一个框架：用显式的潜变量检验模型比较真实文本与生成文本的高层结构。论文于 2022 年 10 月 16 日首次发布，发表于 EMNLP 2022，将长文本评估转化为一个明确的统计问题：生成器是否重现了参考文本中的结构分布？

## 区分语言流畅与结构连贯

设想一篇文章先介绍方法、再展示结果，随后却转回一段无关的引言。每句话的语法都正确，章节顺序仍然不合常理。叙事文本也有类似问题：实体突然消失、前后不一致地重新出现，或者在长篇内容中呈现不合理的变化模式。

词元层面的困惑度衡量模型预测词元的能力，却不直接衡量章节转移、共指结构或主题关系。论文用生成过程已知的合成数据说明了这一差别：模型即使擅长预测下一个词元，仍然会对底层潜在状态的转移拟合不佳。

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## 选择能够表达待测性质的检验模型

这一框架引入一个检验模型（critic），显式建模潜在结构与观测文本的生成过程。它的后验把文档映射成潜变量上的分布。随后，对生成样本和参考数据使用同一个检验模型，比较两者推断出的结构。

一种诊断量是：在检验模型的先验分布下，推断出的潜变量所对应的负对数概率的期望。汇总后得到潜在交叉熵，实验中将其表示为潜在困惑度。这样，被测性质就变得明确：评估章节顺序与评估实体复用需要不同的潜变量模型。检验模型给出关于结构的假设，它与被评估的语言模型是两个不同的模型。

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## 三个关于结构的问题

篇章连贯性关注章节是否遵循真实文档中的转移模式。实验考察了科学论文与维基百科文本，包括提供和不提供显式章节标题提示的生成设置。共指关注生成文本是否重现实体指称的模式。主题性关注主题之间的关系是否与参考文档一致。

这些诊断分别回答不同的问题。论文发现，所评估的 Transformer 语言模型能够捕捉主题相关性，却难以掌握篇章连贯性和共指结构。单一的整体质量分数会掩盖这种差别。

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## 模型检验与故事评估指标如何配合

OpenMEVA 评估的是评估器本身。它用受控扰动检验自动指标能否识别连贯性错误，以及在不改变语义的变换下能否保持稳定。潜在空间中的模型检验则研究生成器学到了哪些结构分布。两者回答不同的实验问题，能够在同一套评估中配合使用。

Dingyi Yang 和 Qin Jin 的故事评估综述整理了连贯性、人物发展和趣味性等更广泛的标准。人工评估或 LLM 评判器回答读者关心的问题；明确指定结构的检验模型则提供可复现、针对具体性质的诊断。

- [OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics](https://aclanthology.org/2021.acl-long.500/)
- [What Makes a Good Story and How Can We Measure It? A Comprehensive Survey of Story Evaluation](https://arxiv.org/abs/2408.14622)
- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## 设计长文本评估

先明确要检测什么错误，再定义对应的潜在表示与参考语料。拟合或指定检验模型，检查它在真实文本和已知结构错误上的表现，然后以相同方式处理参考样本和生成样本。明确报告生成条件、文档长度和样本数量，让比较回答预定的问题。

分别报告词元层面与结构层面的指标。原论文和开源代码分别实现了篇章连贯性、共指和主题性的诊断。

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)
- [OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics](https://aclanthology.org/2021.acl-long.500/)

## 参考文献

- Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. Model Criticism for Long-Form Text Generation. EMNLP 2022. https://aclanthology.org/2022.emnlp-main.815/
- Jian Guan, Zhexin Zhang, Zhuoer Feng, Zitao Liu, Wenbiao Ding, Xiaoxi Mao, Changjie Fan, Minlie Huang. OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics. ACL-IJCNLP 2021. https://aclanthology.org/2021.acl-long.500/
- Dingyi Yang, Qin Jin. What Makes a Good Story and How Can We Measure It? A Comprehensive Survey of Story Evaluation. arXiv. https://arxiv.org/abs/2408.14622
