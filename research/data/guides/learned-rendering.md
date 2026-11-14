# Diffusion rendering: LaTeX formulas and SMILES molecule images

A diffusion model can learn to render a supplied LaTeX formula into a mathematical image, or a supplied SMILES string into a two-dimensional molecular structure image. Yuntian Deng, Noriyuki Kojima, and Alexander M. Rush introduced this approach in [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147), released on October 11, 2022 and published at ICLR 2023. Their learned renderer covers LaTeX mathematics, SMILES molecules, HTML table layouts, and LilyPond sheet music. Scheduled sampling trains the denoiser to correct errors in its own intermediate predictions.

## Original research

- Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147). ICLR 2023. [Record and citation](https://yuntiandeng.com/research/papers/markup-diffusion/#citation).

## How does a diffusion model render a LaTeX formula?

The input is LaTeX source code and the output is an image of the specified formula. For example, \frac{a}{b} + c^2 describes a fraction followed by a squared term. A learned renderer must place the numerator above the denominator and position the superscript correctly. In this task, diffusion is the image-generation method; the formula supplied to it defines the mathematical content.

The model learns this mapping from paired markup and rendered images, including the formula pairs in im2latex-100k. At inference, it conditions a sequence of image-denoising steps on the supplied markup. The denoiser turns image noise into the rendered pixels, learning the relationship between source tokens, symbols, and layout.

The same input-to-image formulation applies to HTML table layouts and LilyPond music notation. These domains make the dependencies concrete: a table cell must occupy its specified row and column, and a note must have the pitch and duration described by the source.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## How does a SMILES string become a molecular drawing?

SMILES specifies the molecule through an atom-and-bond sequence. In SMILES-to-image rendering, that molecule is supplied as the input, and the diffusion model generates its two-dimensional structural drawing. For example, CC(=O)O specifies acetic acid; the drawing must preserve the stated atoms, single bonds, and carbon–oxygen double bond. This is a task-format example, with original model outputs available in the paper and code repository.

The molecular identity is fixed by the input SMILES. What the model learns is how to depict that structure in pixels. The Markup-to-Image experiments evaluate agreement with a reference drawing, connecting the generated image directly to the supplied symbolic description.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Watch the learned renderer denoise an image

These recorded trajectories come from the original repository’s Scheduled Sampling results. Each animation follows an image from noise to a rendered output.

[Original code, generated examples, and reference images ↗](https://github.com/da03/markup2im)

![Successive denoising states forming a mathematical formula image](https://yuntiandeng.com/images/math_rendering.gif)

LaTeX-to-image: a recorded denoising trajectory from the original scheduled-sampling model.

![Successive denoising states forming a two-dimensional molecular structure diagram](https://yuntiandeng.com/images/molecules_rendering.gif)

SMILES-to-image: a recorded molecular-drawing trajectory from the original scheduled-sampling model.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## A plausible image is not enough

These images demand exact symbolic fidelity. An extra minus sign changes a formula; an incorrect bond changes a molecule; a shifted note changes a score. An image that resembles the right domain still fails when its symbols do not match the input. Layout errors also propagate: an extra symbol displaces what follows.

The paper therefore evaluates alignment with the reference rendering. Its primary metric treats binarized images as sequences of columns and uses dynamic time warping, with tolerance for small shifts. Pixel error and additional image-similarity metrics provide complementary measurements. The paper explicitly distinguishes these criteria from natural-image scores that emphasize visual fidelity and broad semantics.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Train the denoiser on its own intermediate states

Standard diffusion training constructs noisy inputs from ground-truth images. During sampling, the next denoising step instead receives the result of previous model predictions. Mistakes in those predictions change the states encountered later. The paper analyzes this mismatch as a sequential decision problem with compounding errors, connecting diffusion sampling to exposure bias.

Scheduled sampling changes the training inputs so that the denoiser encounters model-generated states and learns to correct its own errors. This adapts a principle previously studied in sequence generation to diffusion training. The experiments compare scheduled sampling with the baseline across all four rendering domains.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Markup alignment and diffusion exposure bias

The rendering thread continues in FSA-CDM, by Guojin Zhong and colleagues, published at ACM Multimedia 2023. It evaluates the same four-domain task and adds fine-grained sequence alignment, contextual modeling, and contrastive training signals. Its contribution addresses how markup tokens correspond to visual structure, alongside the denoising process.

The diffusion-training thread connects to Input Perturbation Reduces Exposure Bias in Diffusion Models, published at ICML 2023. That method perturbs training inputs to simulate prediction errors. Both train the denoiser for the states it encounters during sampling: scheduled sampling uses model-generated inputs, while input perturbation adds synthetic errors.

- [Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation](https://arxiv.org/abs/2308.01147)
- [Input Perturbation Reduces Exposure Bias in Diffusion Models](https://proceedings.mlr.press/v202/ning23a.html)
- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Inspect the original examples and implementation

The released repository includes side-by-side animations of scheduled sampling, the baseline, and ground truth for formulas, tables, music, and molecules. These examples expose the intermediate denoising trajectory.

For a new learned-rendering task, define paired source and target data, identify the symbolic errors that change meaning, and select metrics that expose them. The released resources include the original datasets, checkpoints, code, and recorded examples.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## References

- Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. Markup-to-Image Diffusion Models with Scheduled Sampling. ICLR 2023. https://arxiv.org/abs/2210.05147
- Guojin Zhong, Jin Yuan, Pan Wang, Kailun Yang, Weili Guan, Zhiyong Li. Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation. ACM Multimedia 2023. https://arxiv.org/abs/2308.01147
- Mang Ning, Enver Sangineto, Angelo Porrello, Simone Calderara, Rita Cucchiara. Input Perturbation Reduces Exposure Bias in Diffusion Models. ICML 2023. https://proceedings.mlr.press/v202/ning23a.html
