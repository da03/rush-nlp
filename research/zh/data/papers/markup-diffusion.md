# Markup-to-Image Diffusion Models with Scheduled Sampling

Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. ICLR 2023 (2023).

通过条件扩散学习渲染 LaTeX、HTML 表格布局、LilyPond 乐谱和 SMILES 分子。Scheduled Sampling 让去噪器接触自己生成的输入，以处理逐步累积的错误。

原始扩散式标记语言到图像方法，以及覆盖四个领域的渲染基准。

## 原文摘要（英文）

Building on recent advances in image generation, we present a fully data-driven approach to rendering markup into images. The approach is based on diffusion models, which parameterize the distribution of data using a sequence of denoising operations on top of a Gaussian noise distribution. We view the diffusion denoising process as a sequential decision making process, and show that it exhibits compounding errors similar to exposure bias issues in imitation learning problems. To mitigate these issues, we adapt the scheduled sampling algorithm to diffusion training. We conduct experiments on four markup datasets: mathematical formulas (LaTeX), table layouts (HTML), sheet music (LilyPond), and molecular images (SMILES). These experiments each verify the effectiveness of the diffusion process and the use of scheduled sampling to fix generation issues. These results also show that the markup-to-image task presents a useful controlled compositional setting for diagnosing and analyzing generative image models.

[论文原文](https://arxiv.org/abs/2210.05147)

## 引用

```bibtex
@inproceedings{deng2023markuptoimage,
  title = {{Markup-to-Image Diffusion Models with Scheduled Sampling}},
  author = {Deng, Yuntian and Kojima, Noriyuki and Rush, Alexander M.},
  year = {2023},
  booktitle = {ICLR 2023},
  url = {https://arxiv.org/abs/2210.05147},
  eprint = {2210.05147},
  archivePrefix = {arXiv},
  doi = {10.48550/arXiv.2210.05147}
}
```
