# Evaluating generated text beyond fluency: story structure and entity consistency

[Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/), by Yuntian Deng, Volodymyr Kuleshov, and Alexander M. Rush, evaluates the high-level structure of language-model output: how a document progresses, how it refers to entities, and how its topics relate. First released on October 16, 2022 and published at EMNLP 2022, it introduced a framework that maps real and generated text into latent structures and compares their distributions. This gives long-form text evaluation a structural test alongside word-level fluency.

## Original research

- Yuntian Deng, Volodymyr Kuleshov, Alexander M. Rush. [Model Criticism for Long-Form Text Generation](https://aclanthology.org/2022.emnlp-main.815/). EMNLP 2022. [Record and citation](https://yuntiandeng.com/research/papers/model-criticism/#citation).

## Separate fluent wording from coherent structure

A generated story reads: “Mira left the key at home. At the locked cabin, she opened the door with that key.” Both sentences are fluent; the story skips the event that makes the key available. An article presents another structural problem when it introduces a method, gives results, and then switches to an unrelated introduction. Evaluating these outputs requires stating the high-level property being tested.

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

## Entity consistency in generated stories

Consider “Nora gave Eli a key. She left. Eli opened the door.” An entity representation assigns the two mentions of Nora, “Nora” and “She,” to one entity, and the two mentions of Eli to another. It records which entity each expression refers to and where the mention occurs. This turns a passage into a sequence of entity references that can be compared across human-written and generated stories.

The paper’s coreference experiment extracts these mention patterns and scores their distribution with a critic, including patterns in which a pronoun lacks a local antecedent. Its discourse critic examines section transitions, and its topic critic examines topic relationships. An evaluation of the key’s location in the earlier story would specify event and object-state variables as the property to test.

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
