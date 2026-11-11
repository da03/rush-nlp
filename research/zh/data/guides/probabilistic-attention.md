# 把注意力建模为隐变量：学习注意力的概率分布

Yuntian Deng、Yoon Kim、Justin Chiu、Demi Guo 和 Alexander M. Rush 的 Latent Alignment and Variational Attention（NeurIPS 2018）将注意力建模为显式隐变量，并使用变分推断进行学习。其一般思路是对网络关注的位置建立概率分布，并对这一分布进行推断，而不是把一个确定性的加权平均向量传入预测网络。

## 归一化注意力权重与概率模型有什么区别

注意力向量由非负且和为一的权重组成。但这一数值性质并没有规定不确定性如何参与预测。确定性机制用这些权重构造一个上下文向量，然后执行一次下游网络。隐变量机制定义不同的注意力状态，在这些状态下分别预测，再综合它们的贡献。

用 z 表示注意力状态，用 f 表示下游计算。一般情况下，f(E[z]) ≠ E[f(z)]。例如，z 以相同概率取 0 或 2，且 f(z) = z²。先求均值再计算 f，结果为 1；分别计算两个输出再求平均，结果为 2。神经网络的预测包含非线性操作，因此把期望移到网络的另一侧会改变模型。这正是“对表示求平均”和“对预测求平均”的区别。

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)
- [Structured Attention Networks](https://arxiv.org/abs/1702.00887)

## 隐对齐与变分注意力

2018 年的论文把对齐作为生成模型中的显式变量。论文研究了选取一个源元素的类别对齐，以及把注意力分配到多个元素混合上的狄利克雷（Dirichlet）对齐。摊销变分推断学习以观测输入和输出为条件的后验分布。方差缩减方法使隐变量推断能用于实际训练，实验涵盖机器翻译和视觉问答。

先验注意力回答“在知道答案之前应关注哪里”，后验注意力回答“哪些对齐能够解释已经观测到的答案”。这是两个不同的条件分布。论文的推断网络在训练时使用目标信息；这与生成阶段把未来目标词提供给从左到右的预测器是不同的操作。

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## 注意力后验告诉我们什么

设想一张图片里有两个人，问题是“谁拿着杯子”。在看到答案之前，模型为两个人都分配注意力概率。观测到答案后，后验推断把概率重新分配给能够解释这个答案的对齐。这个例子提出的是一个推断问题，与用什么可视化方式展示权重无关。

当注意力与另一个概率模块组合时，这一区别同样重要。显式变量说明了哪些量是条件、哪些备选状态被积分消去，以及近似方法替换了哪一步。采样得到的注意力向量、它的期望和最大概率取值回答不同的问题；明确分布后，这些选择就能被逐项检查。

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## 相关注意力方法有何不同

Show, Attend and Tell（ICML 2015）研究了用于图像描述生成的确定性软注意力和通过采样得到的硬注意力。其随机形式使用变分下界和基于采样的学习规则，是概率选择的早期研究。Latent Alignment and Variational Attention 进一步学习对齐的后验推断，并采用更紧的变分训练目标。

Structured Attention Networks（ICLR 2017）为结构化选择建立分布，包括子序列和句法树。可微的图模型推断向周围的网络提供期望表示，从而丰富注意力的结构。计算期望表示，与遍历注意力结构并对最终非线性预测进行边缘化，仍是两个不同的操作。

Variational Attention for Sequence-to-Sequence Models（COLING 2018）在变分编码器—解码器中用高斯随机变量建模上下文向量，目的是防止确定性注意力绕过模型的隐空间。这里的隐变量是上下文向量，而 Latent Alignment and Variational Attention 中的隐变量是类别值或单纯形上的对齐。

Bayesian Attention Modules（NeurIPS 2020）通过归一化 Weibull 或对数正态随机变量构造随机注意力权重。重参数化训练与依赖数据的先验使这些模块适用于不同的注意力架构。它以不同的分布族和训练方式，进一步发展了“对注意力建立分布”的一般视角。

- [Show, Attend and Tell: Neural Image Caption Generation with Visual Attention](https://proceedings.mlr.press/v37/xuc15.html)
- [Structured Attention Networks](https://arxiv.org/abs/1702.00887)
- [Variational Attention for Sequence-to-Sequence Models](https://aclanthology.org/C18-1142/)
- [Bayesian Attention Modules](https://arxiv.org/abs/2010.10604)
- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## 理解概率注意力模型的四个问题

首先确定随机对象：选中的位置、位置上的概率分布、上下文向量，还是完整的结构化选择。其次规定先验，以及后验能使用哪些信息。然后辨明预测时综合的是中间表示，还是输出似然。最后说明训练与预测是枚举状态、采样、使用期望，还是优化变分近似。

这些选择决定模型的含义，也使不同方法之间的比较具有实质内容：两个都叫“变分注意力”的系统，不一定表示同一个隐变量，也不一定解决同一个推断问题。

| 方法 | 随机对象或结构化对象 | 推断的作用 |
| --- | --- | --- |
| Latent Alignment and Variational Attention | 类别或狄利克雷对齐 | 学习对齐后验，近似边缘似然 |
| Structured Attention Networks | 子序列或树的选择 | 计算期望表示 |
| Variational Attention for Seq2Seq | 高斯上下文向量 | 保留经过编码器—解码器的随机路径 |
| Bayesian Attention Modules | 归一化注意力权重的分布 | 重参数化变分训练 |

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)
- [Structured Attention Networks](https://arxiv.org/abs/1702.00887)
- [Variational Attention for Sequence-to-Sequence Models](https://aclanthology.org/C18-1142/)
- [Bayesian Attention Modules](https://arxiv.org/abs/2010.10604)

## 运行精确注意力与变分注意力示例

下载可独立运行的[注意力笔记本](https://yuntiandeng.com/research/examples/latent_attention.ipynb)或 [Python 脚本](https://yuntiandeng.com/research/examples/latent_attention.py)。示例比较两种计算：先对源特征取平均再送入非线性预测器；在不同类别注意力状态下分别预测，再对输出概率取平均。

示例计算一个观测标签对应的后验，并优化类别变分分布。精确对数似然与证据下界（ELBO）之差，等于该变分分布到精确后验的 KL 散度。示例针对一个观测使用固定的生成参数；原论文则跨样本学习摊销推断网络，并研究了狄利克雷注意力。

代码使用 Python 3.9+ 及其标准库运行，无需模型权重、API 密钥或 GPU。[下载全部三个示例及数值检查](https://yuntiandeng.com/research/examples/research-examples.zip)。

- [Latent Alignment and Variational Attention](https://arxiv.org/abs/1807.03756)

## 参考文献

- Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, Alexander M. Rush. Latent Alignment and Variational Attention. NeurIPS 2018. https://arxiv.org/abs/1807.03756
- Kelvin Xu, Jimmy Lei Ba, Ryan Kiros, Kyunghyun Cho, Aaron Courville, Ruslan Salakhutdinov, Richard S. Zemel, Yoshua Bengio. Show, Attend and Tell: Neural Image Caption Generation with Visual Attention. ICML 2015. https://proceedings.mlr.press/v37/xuc15.html
- Yoon Kim, Carl Denton, Luong Hoang, Alexander M. Rush. Structured Attention Networks. ICLR 2017. https://arxiv.org/abs/1702.00887
- Hareesh Bahuleyan, Lili Mou, Olga Vechtomova, Pascal Poupart. Variational Attention for Sequence-to-Sequence Models. COLING 2018. https://aclanthology.org/C18-1142/
- Xinjie Fan, Shujian Zhang, Bo Chen, Mingyuan Zhou. Bayesian Attention Modules. NeurIPS 2020. https://arxiv.org/abs/2010.10604
