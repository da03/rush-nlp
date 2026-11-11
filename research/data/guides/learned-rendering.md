# Learning to render LaTeX, SMILES, HTML and music notation

Markup-to-Image Diffusion Models with Scheduled Sampling, by Yuntian Deng, Noriyuki Kojima, and Alexander M. Rush, learns to turn symbolic descriptions into images. Released on October 11, 2022 and published at ICLR 2023, the work introduced diffusion-based rendering across LaTeX formulas, SMILES molecules, HTML table layouts, and LilyPond sheet music. It also studies a general diffusion problem: errors accumulate when sampling visits states that differ from the model’s training inputs.

## The input is markup; the output is an image

A learned renderer receives a sequence that specifies a visual object and predicts its rendered pixels. LaTeX describes mathematical notation; SMILES describes atoms and bonds; HTML describes a table-like layout; LilyPond describes music notation. The four domains test symbolic content, layout, and dependencies that extend across the input sequence.

This direction matters. Image-to-LaTeX recognition recovers source notation from a picture. Markup-to-image generation performs the reverse task. The paper adapts paired data, including im2latex-100k, to learn this forward mapping from markup to pixels. It trains a conditional diffusion model rather than invoking a conventional rendering engine at inference time.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## A plausible image is not enough

These images demand exact symbolic fidelity. An extra minus sign changes a formula; an incorrect bond changes a molecule; a shifted note changes a score. An image that resembles the right domain still fails when its symbols do not match the input. Layout errors also propagate: an extra symbol displaces what follows.

The paper therefore evaluates alignment with the reference rendering. Its primary metric treats binarized images as sequences of columns and uses dynamic time warping, with tolerance for small shifts. Pixel error and additional image-similarity metrics provide complementary measurements. The paper explicitly distinguishes these criteria from natural-image scores that emphasize visual fidelity and broad semantics.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Train the denoiser on its own intermediate states

Standard diffusion training constructs noisy inputs from ground-truth images. During sampling, the next denoising step instead receives the result of previous model predictions. Mistakes in those predictions change the states encountered later. The paper analyzes this mismatch as a sequential decision problem with compounding errors, connecting diffusion sampling to exposure bias.

Scheduled sampling changes the training inputs so that the denoiser encounters model-generated states and learns to correct its own errors. This adapts a principle previously studied in sequence generation to diffusion training. The experiments compare scheduled sampling with the baseline across all four rendering domains. Recognizable output and faithful symbolic rendering remain separate evaluation targets; the paper reports failures as well as successful generations.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Follow the two research threads

The rendering thread continues in FSA-CDM, by Guojin Zhong and colleagues, published at ACM Multimedia 2023. It evaluates the same four-domain task and adds fine-grained sequence alignment, contextual modeling, and contrastive training signals. Its contribution addresses how markup tokens correspond to visual structure, alongside the denoising process.

The diffusion-training thread connects to Input Perturbation Reduces Exposure Bias in Diffusion Models, published at ICML 2023. That method perturbs training inputs to simulate prediction errors. The shared question is how training should prepare a denoiser for the states it encounters during sampling. Model-generated inputs and synthetic perturbations are different answers, with different training procedures.

- [Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation](https://arxiv.org/abs/2308.01147)
- [Input Perturbation Reduces Exposure Bias in Diffusion Models](https://proceedings.mlr.press/v202/ning23a.html)
- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## Inspect the original examples and implementation

The released repository includes side-by-side animations of scheduled sampling, the baseline, and ground truth for formulas, tables, music, and molecules. These examples expose the intermediate denoising trajectory. Inspect whether symbols appear, disappear, merge, or move, then compare the final output against the exact input specification.

For a new learned-rendering task, define paired source and target data, identify the symbolic errors that change meaning, and select metrics that expose them. Separate rendering accuracy from stylistic resemblance. The original datasets, checkpoints, code, and recorded examples establish a reproducible starting point without treating a successful example as evidence of exact rendering on every input.

- [Markup-to-Image Diffusion Models with Scheduled Sampling](https://arxiv.org/abs/2210.05147)

## References

- Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. Markup-to-Image Diffusion Models with Scheduled Sampling. ICLR 2023. https://arxiv.org/abs/2210.05147
- Guojin Zhong, Jin Yuan, Pan Wang, Kailun Yang, Weili Guan, Zhiyong Li. Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation. ACM Multimedia 2023. https://arxiv.org/abs/2308.01147
- Mang Ning, Enver Sangineto, Angelo Porrello, Simone Calderara, Rita Cucchiara. Input Perturbation Reduces Exposure Bias in Diffusion Models. ICML 2023. https://proceedings.mlr.press/v202/ning23a.html
