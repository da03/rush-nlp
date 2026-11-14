# 扩散模型渲染 LaTeX 公式与 SMILES 分子结构图

扩散模型能够学习把给定的 LaTeX 公式代码渲染成数学公式图片，也能把给定的 SMILES 字符串渲染成二维分子结构图。Yuntian Deng、Noriyuki Kojima 和 Alexander M. Rush 在 [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147) 中提出这一方法，论文于 2022 年 10 月 11 日发布，发表于 ICLR 2023。这个学习式渲染器覆盖 LaTeX 数学公式、SMILES 分子、HTML 表格布局和 LilyPond 乐谱，并通过 Scheduled Sampling 让去噪器学习修正自身中间预测中的错误。

## 原始研究

- Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147). ICLR 2023. [论文记录与引用](https://yuntiandeng.com/research/zh/papers/markup-diffusion/#citation).

## 如何用扩散模型把 LaTeX 代码渲染成公式图片？

输入是 LaTeX 源代码，输出是这段代码指定的公式图像。例如，\frac{a}{b} + c^2 描述一个分数，后面接一个平方项。学习式渲染器需要把分子放在分母上方，并正确放置上标。在这个任务中，扩散是生成图像的方法；输入的公式代码决定要画出的数学内容。

模型从标记语言与渲染图像的配对数据中学习这一映射，其中包括 im2latex-100k 的公式数据。推理时，输入的标记序列作为条件，参与连续的图像去噪步骤。去噪器把图像噪声转化为渲染后的像素，学习源词元、符号和布局之间的关系。

同一个输入到图像的任务也覆盖 HTML 表格布局与 LilyPond 乐谱。表格单元格需要位于指定的行列位置，音符需要表达源代码中的音高和时值；这些对应关系为生成模型提供了具体的结构要求。

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 如何从 SMILES 字符串生成二维分子结构图？

SMILES 用原子与化学键的序列指定分子。SMILES 到图像的渲染任务把这个分子作为输入，由扩散模型生成对应的二维分子结构图。例如，CC(=O)O 指定乙酸；图像需要保留其中的原子、单键以及碳氧双键。这个例子用于说明任务格式，原始模型的生成结果见论文和代码仓库。

输入的 SMILES 已经确定分子身份，模型学习的是如何用像素画出该分子结构。Markup-to-Image 的分子实验比较生成图像与参考结构图，直接检验图像是否对应给定的符号描述。

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 观察学习式渲染器的去噪过程

以下动画来自原始代码仓库中的 Scheduled Sampling 结果，记录图像从噪声逐步形成渲染输出的过程。

[原始代码、生成示例与参考图像 ↗](https://github.com/da03/markup2im)

![连续去噪状态逐步形成数学公式图像](https://yuntiandeng.com/images/math_rendering.gif)

LaTeX 到公式图像：原始 Scheduled Sampling 模型的去噪过程记录。

![连续去噪状态逐步形成二维分子结构图](https://yuntiandeng.com/images/molecules_rendering.gif)

SMILES 到分子结构图：原始 Scheduled Sampling 模型的分子绘图过程记录。

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 图像看起来像，并不等于符号正确

这些图像要求精确保留符号。多一个减号就会改变公式，化学键错误就会改变分子，音符移位就会改变乐谱。即使图像的整体外观符合相应领域，只要符号与输入不一致，渲染就失败了。布局错误还会传播：多出的符号会挤动后续内容。

因此，论文评估生成结果与参考渲染图像的对齐程度。主要指标把二值图像视为由图像列组成的序列，使用动态时间规整（dynamic time warping），以容纳小幅位移。像素误差和其他图像相似性指标提供补充测量。论文明确区分了这些指标与侧重视觉逼真度和宽泛语义的自然图像指标。

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 让去噪器在自己产生的中间状态上训练

标准扩散训练从真实图像构造带噪输入；采样时，下一个去噪步骤接收的却是前面模型预测得到的结果。预测中的错误会改变后续步骤遇到的状态。论文把这种不匹配分析为一个错误会累积的序贯决策问题，将扩散采样与暴露偏差联系起来。

Scheduled Sampling 改变训练输入，让去噪器接触模型自己产生的状态，并学习修正自身错误。它将此前在序列生成中研究的原则用于扩散训练。实验在四个渲染领域中比较了 Scheduled Sampling 与基线。

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 标记语言对齐与扩散暴露偏差

渲染这条线索延伸到 Guojin Zhong 等人在 ACM Multimedia 2023 发表的 FSA-CDM。它沿用四个领域的任务，加入细粒度序列对齐、上下文建模和对比训练信号。除了去噪过程，这项工作还研究标记语言中的词元如何对应图像结构。

扩散训练这条线索则联系到 ICML 2023 论文 Input Perturbation Reduces Exposure Bias in Diffusion Models。该方法通过扰动训练输入，模拟预测误差。两者都针对去噪器在采样时遇到的状态进行训练：Scheduled Sampling 使用模型生成的输入，输入扰动则加入合成误差。

- [Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation](https://arxiv.org/abs/2308.01147)
- [Input Perturbation Reduces Exposure Bias in Diffusion Models](https://proceedings.mlr.press/v202/ning23a.html)
- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 查看原始示例与实现

开源仓库提供了公式、表格、乐谱和分子的并排动画，对照 Scheduled Sampling、基线和真实图像。这些示例展示了中间去噪轨迹。

设计新的学习式渲染任务时，先确定配对的源数据与目标图像，识别哪些符号错误会改变含义，再选择能够暴露这些错误的指标。已发布的资源包括原始数据集、检查点、代码和记录的示例。

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## 参考文献

- Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. Markup-to-Image Diffusion Models with Scheduled Sampling. ICLR 2023. https://arxiv.org/abs/2210.05147
- Guojin Zhong, Jin Yuan, Pan Wang, Kailun Yang, Weili Guan, Zhiyong Li. Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation. ACM Multimedia 2023. https://arxiv.org/abs/2308.01147
- Mang Ning, Enver Sangineto, Angelo Porrello, Simone Calderara, Rita Cucchiara. Input Perturbation Reduces Exposure Bias in Diffusion Models. ICML 2023. https://proceedings.mlr.press/v202/ning23a.html
