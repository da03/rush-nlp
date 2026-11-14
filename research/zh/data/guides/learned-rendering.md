# 学习渲染 LaTeX、SMILES、HTML 与乐谱

Yuntian Deng、Noriyuki Kojima 和 Alexander M. Rush 的 Markup-to-Image Diffusion Models with Scheduled Sampling 学习把符号描述转化为图像。论文于 2022 年 10 月 11 日发布，发表于 ICLR 2023，提出了覆盖 LaTeX 公式、SMILES 分子、HTML 表格布局和 LilyPond 乐谱的扩散渲染方法。它也研究了扩散模型中的一个普遍问题：采样过程中遇到的状态与训练输入不同时，错误会逐步累积。

## 输入是标记语言，输出是图像

学习式渲染器接收描述视觉对象的序列，预测渲染后的像素。LaTeX 描述数学记号，SMILES 描述原子与化学键，HTML 描述表格类布局，LilyPond 描述乐谱。这四个领域共同检验模型对符号内容、布局，以及跨越输入序列的依赖关系的处理能力。

图像到 LaTeX 的识别任务从图片恢复源代码；标记语言到图像的生成任务则朝相反方向进行。论文调整了包括 im2latex-100k 在内的配对数据，学习从标记语言到像素的正向映射。它训练的是条件扩散模型，推理时不调用传统渲染引擎。

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
