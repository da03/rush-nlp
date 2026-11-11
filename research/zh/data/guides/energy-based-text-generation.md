# 基于能量的文本生成：残差模型、重采样与扩散

Residual Energy-Based Models for Text Generation（ICLR 2020）将预训练语言模型与整条序列的能量函数结合，构成全局归一化的生成模型。Energy-Based Diffusion Language Models（ICLR 2025）明确联系这项工作，并把残差能量修正放进扩散去噪步骤。两者共享的机制是：以基础分布为起点，再乘上模型学到的、针对完整候选序列的偏好。

## 用于文本生成的残差能量模型

Yuntian Deng、Anton Bakhtin、Myle Ott、Arthur Szlam 和 Marc’Aurelio Ranzato 在 ICLR 2020 论文中提出了这一文本生成框架，其 arXiv 版本发表于 2020 年 4 月 22 日。固定的自回归语言模型提供候选序列，双向能量函数对候选序列评分。论文围绕这一模型提出了基于重要性加权的条件生成方法，以及用于困惑度评估的对数概率上下界。

模型分布为 p(y | x) = q(y | x) exp(−E(x,y)) / Z(x)。其中，x 是上下文，y 是完整续写，q 是基础模型，E 是残差能量，Z 是对所有续写求和得到的归一化常数。能量越低，相对于 q 的概率就越高。训练采用噪声对比估计（noise-contrastive estimation，NCE），让能量函数区分真实文本和基础模型生成的样本。

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)

## 判别器如何改变生成器

JMLR 2021 论文 Residual Energy-Based Models for Text 进一步研究了如何将区分生成文本的能力用于改进生成分布。Anton Bakhtin 和 Yuntian Deng 贡献相同；其他作者为 Sam Gross、Myle Ott、Marc’Aurelio Ranzato 和 Arthur Szlam。判别器提供的信息指出生成器对哪些文本生成过多、对哪些文本生成不足；残差模型把这些信息转化为对概率的修正。

基础模型提供流畅的候选文本及其相对出现频率；能量函数在看完整条序列后，调整不同候选的相对偏好。如果所有能量都为零，基础分布保持不变。给所有能量加上同一个常数，也不会改变归一化后的分布，因为这个常数在分子和分母中相互抵消。

无论使用哪种网络计算能量，都有两项代数检查：改变所有候选共享的能量偏移量，选择概率保持不变；降低某一个候选的能量，它的概率就会增加。

- [Residual Energy-Based Models for Text](https://www.jmlr.org/papers/v22/20-326.html)

## 先采样，再评分，然后重采样

先从 q 中抽取候选，用 E 为每个候选评分，再按照与 exp(−E) 成正比的归一化权重选择输出。这就是重要性重采样。若改为直接选择得分最高的候选，则是重排序（reranking）：选择规则发生了变化。两者都经过生成候选与评分这两个环节，但定义的输出分布不同。

例如，三个已采样候选的能量分别为 0、log(2) 和 log(4)，对应权重为 1、1/2 和 1/4，因此选择概率为 4/7、2/7 和 1/7。按最高分选择会始终输出第一个候选；重采样则保留候选池上的概率分布。

从 q 抽取候选池这一步已经体现了基础概率。若再给每个候选池权重乘一次 q，就改变了原本的重要性计算。同样，有限候选池中的归一化常数，也不等于对所有可能文本精确求和的结果。增加候选数会改变近似程度和计算开销；改变能量则会改变目标分布。

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Residual Energy-Based Models for Text](https://www.jmlr.org/papers/v22/20-326.html)

## 与扩散语言模型的直接联系

Minkai Xu 等人的 Energy-Based Diffusion Language Models（EDLM）于 2024 年 10 月 28 日发布，发表于 ICLR 2025。它在扩散去噪器的分布上乘以一个序列级残差能量项；该能量以带噪序列和时间步为条件，修正单个去噪步骤内因词元预测相互独立而遗漏的依赖关系。

EDLM 使用从自回归模型导出的能量，或用 NCE 训练的能量，再通过并行重要性采样生成文本。它在相关工作中引用 Deng 等人（2020），并在配分函数估计中明确采用这项工作。两者的联系体现在数学形式和算法上：残差修正、对比训练、重采样和似然估计。

2020 年的模型修正自回归候选分布，以完成文本生成；EDLM 则在迭代扩散过程中修正去噪分布。修正发生的位置不同，但“基础分布乘以能量权重”的构造将两者联系起来。

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Energy-Based Diffusion Language Models for Text Generation](https://arxiv.org/html/2410.21357v4)

## 比较基础分布、能量和推断方式

Wang 和 Ou 的 neural TRF 论文给出了更早的残差形式与 NCE 方法，2020 年论文明确引用了这项工作。2020 年工作的贡献是围绕残差模型建立条件文本生成与似然评估方法。Unified Energy（2026）进一步分析扩散解码中的依赖误差与不变性误差，并结合两类能量修正。

| 方法 | 基础分布与修正 | 推断或评估重点 |
| --- | --- | --- |
| Neural TRF with NCE · 2018 | 对参考语言模型进行指数倾斜 | 语音识别重评分 |
| Residual EBM · 2020 | 自回归语言模型 × 序列能量 | 通过重要性重采样进行条件生成；似然上下界 |
| EDLM · 2025 | 扩散去噪器 × 条件序列能量 | 在去噪步骤中并行生成候选并重采样 |
| Unified Energy · 2026 | 针对依赖关系与不变性的能量修正 | 改进扩散解码 |

- [Learning Neural Trans-Dimensional Random Field Language Models with Noise-Contrastive Estimation](https://arxiv.org/abs/1710.10739)
- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)
- [Energy-Based Diffusion Language Models for Text Generation](https://arxiv.org/html/2410.21357v4)
- [Unified Energy for Invariant and Independent Decoding in Diffusion Language Models](https://arxiv.org/html/2606.09159v1)

## 通过能量示例观察这一机制

调整示例中三种结果上的能量强度 β。当 β = 0 时，输出概率就是基础分布。增大 β 会把概率质量移向能量更低的结果，而基础概率仍会影响最终分布。这个示例对三条可能序列计算精确的归一化分布；它不抽取候选池，也不调用语言模型。

如果候选已经从基础模型中采样，重要性重采样所用的候选池权重就是 exp(−E(x))。基础模型的概率因子已经由采样这一步体现。区分这两种计算，才能把归一化模型与实际采样流程对应起来。


## 运行有限候选池的能量重采样

下载可独立运行的[能量重采样 notebook](https://yuntiandeng.com/research/examples/energy_resampling.ipynb)或 [Python 脚本](https://yuntiandeng.com/research/examples/energy_resampling.py)。示例先计算三种结果上的精确残差模型，再从基础分布中抽取候选池，按能量权重选择其中的候选。

代码还会遍历候选计数的所有组合，精确计算有限候选池所产生的输出分布，从而在没有蒙特卡洛噪声的情况下展示近似误差。重复出现的候选保留其出现次数；按最低能量选择和按概率重采样也分别展示。

代码使用 Python 3.9+ 及其标准库运行。[下载全部三个示例及数值检查](https://yuntiandeng.com/research/examples/research-examples.zip)。

- [Residual Energy-Based Models for Text Generation](https://arxiv.org/html/2004.11714v1)

## 参考文献

- Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. Residual Energy-Based Models for Text Generation. ICLR 2020. https://arxiv.org/html/2004.11714v1
- Anton Bakhtin, Yuntian Deng, Sam Gross, Myle Ott, Marc’Aurelio Ranzato, Arthur Szlam. Residual Energy-Based Models for Text. JMLR 22(40):1–41. https://www.jmlr.org/papers/v22/20-326.html
- Minkai Xu, Tomas Geffner, Karsten Kreis, Weili Nie, Yilun Xu, Jure Leskovec, Stefano Ermon, Arash Vahdat. Energy-Based Diffusion Language Models for Text Generation. ICLR 2025. https://arxiv.org/html/2410.21357v4
- Yuchen Yan, Minkai Xu, Zaiquan Yang, Yatao Bian. Unified Energy for Invariant and Independent Decoding in Diffusion Language Models. arXiv:2606.09159. https://arxiv.org/html/2606.09159v1
- Bin Wang, Zhijian Ou. Learning Neural Trans-Dimensional Random Field Language Models with Noise-Contrastive Estimation. ICASSP 2018. https://arxiv.org/abs/1710.10739
