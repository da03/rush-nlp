# Evaluating the structure of long-form text

A fluent paragraph does not establish a coherent document. Model Criticism for Long-Form Text Generation, by Yuntian Deng, Volodymyr Kuleshov, and Alexander M. Rush, introduced a framework for comparing the high-level structures of real and generated text through explicit latent-variable critics. First released on October 16, 2022 and published at EMNLP 2022, it connects long-form evaluation to a concrete statistical question: does a generator reproduce the distribution of structures found in reference texts?

## Separate fluent wording from coherent structure

Consider an article that introduces a method, presents results, and then returns to an unrelated introduction. Each sentence can be grammatical while the section sequence is structurally unusual. A narrative has related problems when entities disappear, reappear inconsistently, or follow implausible patterns across a long passage.

Word-level perplexity measures how well a model predicts tokens. It does not directly measure section transitions, coreference structure, or topical relationships. The paper demonstrates this distinction with synthetic data whose generative process is known: strong next-token prediction coexists with a poor fit to the underlying latent transitions.

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## Choose a critic that expresses the property being tested

The framework introduces a critic with a generative model of latent structure and observed text. Its posterior maps a document into a distribution over latent variables. Criticism then compares the structures inferred from generated samples with those inferred from reference data, using the same critic for both.

One diagnostic is the expected negative log probability of inferred latent variables under the critic’s prior. Aggregating it produces a latent cross-entropy, reported as latent perplexity in the experiments. This makes the measured property explicit: an evaluator of section order and an evaluator of entity reuse need different latent models. The critic supplies an assumption about structure; it is not the language model under evaluation.

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## Three structural questions

Discourse coherence asks whether sections follow the transitions found in real documents. The experiments examine scientific articles and Wikipedia, including generation with and without explicit section-title cues. Coreference asks whether generated text reproduces the patterns of references to entities. Topicality asks whether topic relationships match reference documents.

These are distinct diagnoses. The paper finds that its transformer language models capture topical correlations while struggling with coherence and coreference. A single overall quality score would hide this difference.

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## Relate model criticism to story metrics

OpenMEVA evaluates the evaluators. Its controlled perturbations test whether automatic metrics respond to errors in coherence and remain stable under meaning-preserving changes. Latent-space model criticism instead asks which structural distributions a generator has learned. The two approaches answer different experimental questions and fit together in an evaluation suite.

The story-evaluation survey by Dingyi Yang and Qin Jin organizes broader criteria such as coherence, character development, and interestingness. Human assessment or an LLM judge answers reader-facing questions; a specified structural critic supplies a reproducible diagnostic tied to a particular property.

- [OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics](https://aclanthology.org/2021.acl-long.500/)
- [What Makes a Good Story and How Can We Measure It? A Comprehensive Survey of Story Evaluation](https://arxiv.org/abs/2408.14622)
- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)

## Design a long-form evaluation

Start with the failure you want to detect, then define its latent representation and reference corpus. Fit or specify the critic, check its behavior on real texts and known structural errors, and apply it identically to reference and generated samples. Keep generation conditions, document lengths, and sample counts visible so that the comparison answers the intended question.

Report word-level and structural measurements separately. The original paper and released code implement separate diagnostics for coherence, coreference, and topicality.

- [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/)
- [OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics](https://aclanthology.org/2021.acl-long.500/)

## References

- Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. Model Criticism for Long-Form Text Generation. EMNLP 2022. https://aclanthology.org/2022.emnlp-main.815/
- Jian Guan, Zhexin Zhang, Zhuoer Feng, Zitao Liu, Wenbiao Ding, Xiaoxi Mao, Changjie Fan, Minlie Huang. OpenMEVA: A Benchmark for Evaluating Open-ended Story Generation Metrics. ACL-IJCNLP 2021. https://aclanthology.org/2021.acl-long.500/
- Dingyi Yang, Qin Jin. What Makes a Good Story and How Can We Measure It? A Comprehensive Survey of Story Evaluation. arXiv. https://arxiv.org/abs/2408.14622
