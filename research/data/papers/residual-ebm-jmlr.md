# Residual Energy-Based Models for Text

Anton Bakhtin, Yuntian Deng, Sam Gross, Myle Ott, Marc’Aurelio Ranzato, Arthur Szlam. JMLR 22(40):1–41 (2021).

Studies statistical discrimination of human and model text and incorporates learned discriminators into globally normalized generation.

Extended treatment of the discriminator-to-generator connection and residual energy modeling.

## Abstract

Current large-scale auto-regressive language models display impressive fluency and can generate convincing text. In this work we start by asking the question: Can the generations of these models be reliably distinguished from real text by statistical discriminators? We find experimentally that the answer is affirmative when we have access to the training data for the model, and guardedly affirmative even if we do not. This suggests that the auto-regressive models can be improved by incorporating the (globally normalized) discriminators into the generative process. We give a formalism for this using the Energy-Based Model framework, and show that it indeed improves the results of the generative models, measured both in terms of perplexity and in terms of human evaluation.

[Original paper](https://www.jmlr.org/papers/v22/20-326.html)

## Citation

```bibtex
@article{article_number,
  title = {{Residual Energy-Based Models for Text}},
  author = {Bakhtin, Anton and Deng, Yuntian and Gross, Sam and Ott, Myle and Ranzato, Marc’Aurelio and Szlam, Arthur},
  year = {2021},
  journal = {Journal of Machine Learning Research},
  url = {https://www.jmlr.org/papers/v22/20-326.html},
  volume = {22},
  number = {40},
  pages = {1--41}
}
```
