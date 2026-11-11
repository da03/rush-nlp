# Research notes: language models and structured learning

- [LLM decision trees: from Tree Prompting to agentic classification](https://yuntiandeng.com/research/llm-decision-trees/) — How Tree Prompting learns decision trees of prompted language-model calls, and how it relates to Aug-Tree, GPTree and Agentic Classification Tree.
- [Energy-based text generation: residual models, resampling and diffusion](https://yuntiandeng.com/research/energy-based-text-generation/) — Residual Energy-Based Models for Text Generation connects sequence-level energy, noise-contrastive estimation and importance resampling to energy-based diffusion language models.
- [Structured Decoding: Higher-Order CRFs, Diffusion Language Models, and Candidate Lattices](https://yuntiandeng.com/research/structured-decoding/) — How Cascaded Text Generation and Sequence-to-Lattice connect higher-order CRFs, joint diffusion decoding, and candidate lattices for speculative generation.
- [Attention as a Latent Variable: Modeling a Distribution over Attention](https://yuntiandeng.com/research/probabilistic-attention/) — A guide to Latent Alignment and Variational Attention: distributions over attention, categorical and Dirichlet alignments, marginalization, and posterior inference.
- [Evaluating the structure of long-form text](https://yuntiandeng.com/research/long-form-evaluation/) — How latent-space model criticism evaluates discourse structure, entity behavior, and topicality beyond word-level fluency in generated text.
- [Learning to render LaTeX, SMILES, HTML and music notation](https://yuntiandeng.com/research/learned-rendering/) — Diffusion models as learned renderers for mathematical formulas, molecules, table layouts, and music notation, with scheduled sampling to address exposure bias.
- [Controlling a running training job with humans and AI agents](https://yuntiandeng.com/research/interactive-training/) — Interactive Training connects live metrics to human and LLM interventions in running neural-network jobs; v2 adds typed controls and an ordered action journal.

## Papers

### Tree Prompting: Efficient Task Adaptation without Fine-Tuning

John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. EMNLP 2023.

Learns a reusable decision tree whose internal decisions are prompted language-model calls, with few-shot, instruction and dynamically generated prompt candidates.

Original prompt-based decision-tree method: task adaptation changes the tree and prompts while keeping the language model fixed.

[Paper](https://arxiv.org/html/2310.14034v1) · [Record and citation](https://yuntiandeng.com/research/papers/tree-prompting/)

### Augmenting interpretable models with large language models during training

Chandan Singh, Armin Askari, Rich Caruana, Jianfeng Gao. Nature Communications 14, 7913.

Aug-Tree uses language-model-generated expansions to construct interpretable text features for tree splits.

Contrasts training-time feature expansion with Tree Prompting’s language-model calls while traversing a tree.

[Paper](https://www.nature.com/articles/s41467-023-43713-1) · [Record and citation](https://yuntiandeng.com/research/papers/aug-tree/)

### GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees

Sichao Xiong, Yigit Ihlamur, Fuat Alican, Aaron Ontoyin Yin. arXiv:2411.08257.

Builds decision trees with LLM-assisted splits and incorporates expert feedback to revise decision paths.

A later LLM decision-tree system with expert interaction and several split types.

[Paper](https://arxiv.org/html/2411.08257v1) · [Record and citation](https://yuntiandeng.com/research/papers/gptree/)

### ACT: Agentic Classification Tree

Vincent Grari, Tim Arni, Thibault Laugel, Sylvain Lamprier, James Zou, Marcin Detyniecki. arXiv:2509.26433.

Learns classification trees of natural-language binary questions through impurity-based split selection and TextGrad refinement.

A later agentic formulation of learning question-based decision trees; compare question optimization and tree construction.

[Paper](https://arxiv.org/html/2509.26433v4) · [Record and citation](https://yuntiandeng.com/research/papers/act/)

### Residual Energy-Based Models for Text Generation

Yuntian Deng, Anton Bakhtin, Myle Ott, Arthur Szlam, Marc’Aurelio Ranzato. ICLR 2020.

Combines a fixed autoregressive language model with a learned sequence-level energy, NCE training, conditional generation by importance resampling, and likelihood bounds.

Original text-generation and evaluation framework connecting sequence-level residual energies to modern energy-corrected diffusion decoding.

[Paper](https://arxiv.org/html/2004.11714v1) · [Record and citation](https://yuntiandeng.com/research/papers/residual-ebm/)

### Residual Energy-Based Models for Text

Anton Bakhtin, Yuntian Deng, Sam Gross, Myle Ott, Marc’Aurelio Ranzato, Arthur Szlam. JMLR 22(40):1–41.

Studies statistical discrimination of human and model text and incorporates learned discriminators into globally normalized generation.

Extended treatment of the discriminator-to-generator connection and residual energy modeling.

[Paper](https://www.jmlr.org/papers/v22/20-326.html) · [Record and citation](https://yuntiandeng.com/research/papers/residual-ebm-jmlr/)

### Energy-Based Diffusion Language Models for Text Generation

Minkai Xu, Tomas Geffner, Karsten Kreis, Weili Nie, Yilun Xu, Jure Leskovec, Stefano Ermon, Arash Vahdat. ICLR 2025.

Adds a full-sequence residual energy to each diffusion denoising distribution, with autoregressive or NCE parameterizations and parallel importance sampling.

Directly cites Deng et al. (2020), carrying residual correction and partition estimation into diffusion language modeling.

[Paper](https://arxiv.org/html/2410.21357v4) · [Record and citation](https://yuntiandeng.com/research/papers/edlm/)

### Unified Energy for Invariant and Independent Decoding in Diffusion Language Models

Yuchen Yan, Minkai Xu, Zaiquan Yang, Yatao Bian. arXiv:2606.09159.

Combines energy corrections for dependency and invariance in diffusion decoding.

Extends the contemporary energy-corrected diffusion direction with a unified treatment of decoding errors.

[Paper](https://arxiv.org/html/2606.09159v1) · [Record and citation](https://yuntiandeng.com/research/papers/unified-energy/)

### Learning Neural Trans-Dimensional Random Field Language Models with Noise-Contrastive Estimation

Bin Wang, Zhijian Ou. ICASSP 2018.

Uses an exponentially tilted reference distribution and noise-contrastive estimation for neural random-field language models.

Earlier residual formulation and NCE training explicitly discussed in the 2020 paper; its evaluation centers on speech-recognition rescoring.

[Paper](https://arxiv.org/abs/1710.10739) · [Record and citation](https://yuntiandeng.com/research/papers/neural-trf-nce/)

### Cascaded Text Generation with Markov Transformers

Yuntian Deng, Alexander M. Rush. NeurIPS 2020.

Higher-order CRF cascades for parallel text generation, parameterized by one Markov Transformer.

Increasing output dependence with tractable structured inference connects to joint modeling inside diffusion decoding.

[Paper](https://arxiv.org/abs/2006.01112) · [Record and citation](https://yuntiandeng.com/research/papers/cascaded2020/)

### Sequence-to-Lattice Models for Fast Translation

Yuntian Deng, Alexander M. Rush. Findings of EMNLP 2021.

Candidate lookup, parallel conditional edge scoring, and exact Viterbi decoding replace a deep translation decoder.

Its candidate–edge–path architecture connects to coherent parallel drafting; its objective and inference differ from speculative prefix selection.

[Paper](https://aclanthology.org/2021.findings-emnlp.318/) · [Record and citation](https://yuntiandeng.com/research/papers/lattice2021/)

### Fast Structured Decoding for Sequence Models

Zhiqing Sun, Zhuohan Li, Haoqing Wang, Di He, Zi Lin, Zhi-Hong Deng. NeurIPS 2019.

Adds approximate first-order CRF inference and dynamic transitions to non-autoregressive sequence models.

A first-order structured-decoding reference; Cascaded Text Generation develops higher-order cascades and shared Markov Transformer potentials.

[Paper](https://proceedings.neurips.cc/paper_files/paper/2019/hash/74563ba21a90da13dacf2a73e3ddefa7-Abstract.html) · [Record and citation](https://yuntiandeng.com/research/papers/sun2019/)

### Breaking the Factorization Barrier in Diffusion Language Models

Ian Li, Zilei Shao, Benjie Wang, Rose Yu, Guy Van den Broeck, Anji Liu. ICML 2026.

CoDD composes factorized diffusion predictions with a tractable probabilistic-circuit prior to model joint token dependencies.

Shares structured generation’s separation of parallel neural scoring from joint probabilistic inference.

[Paper](https://proceedings.mlr.press/v306/li26fd.html) · [Record and citation](https://yuntiandeng.com/research/papers/codd2026/)

### DA-DLM: Explicitly Modeling Token Dependencies in Diffusion Language Models

Pengyu Ji, Zichen Zhang, Xiang Hu, Kewei Tu. EMNLP 2026.

Adapts directed-acyclic dependency modeling to iterative diffusion using position-oriented candidate groups and fixed-token anchors.

A direct transfer of structured output modeling from non-autoregressive translation to diffusion denoising.

[Paper](https://aclanthology.org/2026.emnlp-main.2094/) · [Record and citation](https://yuntiandeng.com/research/papers/dadlm2026/)

### LiLiCorr: Lightweight Likelihood Correlation of Parallel Drafts for Speculative Decoding

Matan Rusanovsky, Yoav Miron, Roy Uziel, Omer Belhasin, Hao Guo, Ran Zilberstein, Maor Ashkenazi, Michael Elad. arXiv 2026.

Scores adjacent compatibility among top-K parallel draft candidates and selects a draft through a cheap greedy walk.

Uses the candidate–edge–path pattern with local training and inference tailored to speculative prefix acceptance.

[Paper](https://arxiv.org/abs/2608.20530) · [Record and citation](https://yuntiandeng.com/research/papers/lilicorr2026/)

### DiffuSpec: Unlocking Diffusion Language Models for Speculative Decoding

Guanghao Li, Zhihui Fu, Min Fang, Qibin Zhao, Ming Tang, Chun Yuan, Jun Wang. Findings of ACL 2026.

Uses diffusion drafting, Causal-consistency Path Search over token lattices, and adaptive draft lengths.

Connects candidate-lattice path selection to autoregressive verification of parallel diffusion proposals.

[Paper](https://aclanthology.org/2026.findings-acl.1048/) · [Record and citation](https://yuntiandeng.com/research/papers/diffuspec2026/)

### Latent Alignment and Variational Attention

Yuntian Deng, Yoon Kim, Justin Chiu, Demi Guo, Alexander M. Rush. NeurIPS 2018.

Models alignment as a latent variable and learns approximate posterior inference through variational attention.

A general framework for distributions over attention, beyond a deterministic attention vector.

[Paper](https://arxiv.org/abs/1807.03756) · [Record and citation](https://yuntiandeng.com/research/papers/latentattention2018/)

### Show, Attend and Tell: Neural Image Caption Generation with Visual Attention

Kelvin Xu, Jimmy Lei Ba, Ryan Kiros, Kyunghyun Cho, Aaron Courville, Ruslan Salakhutdinov, Richard S. Zemel, Yoshua Bengio. ICML 2015.

Introduces deterministic soft and stochastic hard visual attention for image captioning.

An early stochastic-attention reference for the distinction between expected features and sampled selection.

[Paper](https://proceedings.mlr.press/v37/xuc15.html) · [Record and citation](https://yuntiandeng.com/research/papers/showattendtell2015/)

### Structured Attention Networks

Yoon Kim, Carl Denton, Luong Hoang, Alexander M. Rush. ICLR 2017.

Uses differentiable graphical-model inference to attend over subsequences and syntactic trees.

Models structured selections and computes expected annotations; full prediction marginalization is a separate operation.

[Paper](https://arxiv.org/abs/1702.00887) · [Record and citation](https://yuntiandeng.com/research/papers/structuredattention2017/)

### Variational Attention for Sequence-to-Sequence Models

Hareesh Bahuleyan, Lili Mou, Olga Vechtomova, Pascal Poupart. COLING 2018.

Treats attention context vectors as Gaussian latent variables in a variational encoder-decoder.

Clarifies that the term variational attention also names a different random object: the context vector.

[Paper](https://aclanthology.org/C18-1142/) · [Record and citation](https://yuntiandeng.com/research/papers/bahuleyan2018/)

### Bayesian Attention Modules

Xinjie Fan, Shujian Zhang, Bo Chen, Mingyuan Zhou. NeurIPS 2020.

Builds distributions over attention weights from normalized reparameterizable variables and learns them with Bayesian regularization.

Extends probabilistic attention to modular stochastic weights with data-dependent priors.

[Paper](https://arxiv.org/abs/2010.10604) · [Record and citation](https://yuntiandeng.com/research/papers/bayesianattention2020/)

### Model Criticism for Long-Form Text Generation

Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. EMNLP 2022.

A framework for evaluating high-level text structure by comparing real and generated data in latent spaces defined by explicit generative critics. Experiments study discourse coherence, coreference, and topicality.

The original method behind this guide: diagnostic evaluation of structural distributions, separate from word-level fluency.

[Paper](https://aclanthology.org/2022.emnlp-main.815/) · [Record and citation](https://yuntiandeng.com/research/papers/model-criticism/)

### OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics

Jian Guan, Zhexin Zhang, Zhuoer Feng, Zitao Liu, Wenbiao Ding, Xiaoxi Mao, Changjie Fan, Minlie Huang. ACL-IJCNLP 2021.

A benchmark for testing automatic story metrics, including human correlation, generalization, robustness, and sensitivity to different coherence errors.

Tests whether an evaluator detects known story defects; complements latent-space criticism of a generator’s output distribution.

[Paper](https://aclanthology.org/2021.acl-long.500/) · [Record and citation](https://yuntiandeng.com/research/papers/openmeva/)

### What Makes a Good Story and How Can We Measure It? A Comprehensive Survey of Story Evaluation

Dingyi Yang, Qin Jin. arXiv.

A survey of story-quality criteria, human evaluation, automatic metrics, and evaluation benchmarks.

Places structural criticism within the broader evaluation of coherence, character development, and narrative quality.

[Paper](https://arxiv.org/abs/2408.14622) · [Record and citation](https://yuntiandeng.com/research/papers/story-evaluation-survey/)

### Markup-to-Image Diffusion Models with Scheduled Sampling

Yuntian Deng, Noriyuki Kojima, Alexander M. Rush. ICLR 2023.

Learns to render LaTeX, HTML table layouts, LilyPond music notation, and SMILES molecules with conditional diffusion. Scheduled sampling exposes denoisers to their own generated inputs to address compounding errors.

The original diffusion-based markup-to-image method and four-domain rendering benchmark discussed in this guide.

[Paper](https://arxiv.org/abs/2210.05147) · [Record and citation](https://yuntiandeng.com/research/papers/markup-diffusion/)

### Contrast-augmented Diffusion Model with Fine-grained Sequence Alignment for Markup-to-Image Generation

Guojin Zhong, Jin Yuan, Pan Wang, Kailun Yang, Weili Guan, Zhiyong Li. ACM Multimedia 2023.

FSA-CDM combines fine-grained cross-modal sequence alignment, contextual modeling, and a contrast-augmented diffusion objective for markup-to-image generation.

A subsequent markup-to-image method that builds on the task and four datasets introduced by Deng, Kojima, and Rush, addressing alignment and contrastive feedback.

[Paper](https://arxiv.org/abs/2308.01147) · [Record and citation](https://yuntiandeng.com/research/papers/fsa-cdm/)

### Input Perturbation Reduces Exposure Bias in Diffusion Models

Mang Ning, Enver Sangineto, Angelo Porrello, Simone Calderara, Rita Cucchiara. ICML 2023.

Studies accumulated sampling errors in diffusion models and trains with perturbed inputs to simulate inference-time prediction errors.

Addresses the same training–sampling mismatch through input perturbation, providing a comparison with scheduled sampling on model-generated states.

[Paper](https://proceedings.mlr.press/v202/ning23a.html) · [Record and citation](https://yuntiandeng.com/research/papers/diffusion-input-perturbation/)

### Interactive Training: Feedback-Driven Neural Network Optimization

Wentao Zhang, Yang Young Lu, Yuntian Deng. EMNLP 2025 System Demonstrations.

An open-source framework in which humans and AI agents intervene in ongoing neural-network training through a control server, changing optimizer settings, training data, and model checkpoints.

The original Interactive Training system connects live monitoring with feedback-driven control of a running training process.

[Paper](https://aclanthology.org/2025.emnlp-demos.65/) · [Record and citation](https://yuntiandeng.com/research/papers/interactive-training-2025/)

### Interactive Training 2: Auditable Control Plane for Live Model Training

Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. arXiv.

A reusable protocol with typed settings, structured actions, application-selected control points, and an ordered journal shared by humans, scripts, and LLM controllers.

Extends the 2025 framework from a Trainer-specific command interface to a common control protocol across training workflows.

[Paper](https://arxiv.org/abs/2607.18314) · [Record and citation](https://yuntiandeng.com/research/papers/interactive-training-2026/)

### LiveTune: Dynamic Parameter Tuning for Feedback-Driven Optimization

Soheil Zibakhsh Shabgahi, Nojan Sheybani, Aiden Tabrizi, Farinaz Koushanfar. arXiv.

LiveVariables expose optimization parameters through designated system ports for real-time adjustment without restarting the optimization loop.

An earlier system for changing running optimization processes; compare its parameter mechanism with Interactive Training’s human/agent command interface and v2 protocol.

[Paper](https://arxiv.org/abs/2311.17279) · [Record and citation](https://yuntiandeng.com/research/papers/livetune/)

### AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes

Anjali Rao, Nikhil Kamalkumar Advani. arXiv.

An asynchronous LLM supervisor observes training telemetry and proposes constrained changes to a running training recipe, with experiments on deliberately induced supervised-learning and reinforcement-learning failure modes.

Studies an automated controller over active training, complementing Interactive Training’s reusable infrastructure for human and automated controllers.

[Paper](https://arxiv.org/abs/2606.29871) · [Record and citation](https://yuntiandeng.com/research/papers/ai-training-manager/)
