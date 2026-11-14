# LLM decision trees for text classification without fine-tuning

In [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1) (EMNLP 2023), John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, and Yuntian Deng learn decision trees that classify text through prompted language-model calls. Each internal node asks the frozen model to judge the input; its answer selects the next branch, and the reached leaf returns a class. The learned prompts and branching structure form a reusable program for the task.

## Original research

- John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1). EMNLP 2023. [Record and citation](https://yuntiandeng.com/research/papers/tree-prompting/#citation).

## What Tree Prompting introduced

The Tree Prompting preprint was released on 21 October 2023 and published at EMNLP 2023; John X. Morris and Chandan Singh contributed equally. A node combines a prompt, an LM call, and a rule mapping the output to a branch. A complete root-to-leaf path is the classifier’s execution trace for one input.

The tree is learned from labeled examples. Candidate prompts include sampled demonstrations, instructions and dynamically generated prompts. In the dynamic version, iPrompt generates candidates for the examples reaching a node, then split quality selects the prompt. Both the node questions and the tree’s branching structure are learned.

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## From input text to node decisions to a class

Consider a worked support-classification example with input “I was charged twice; please refund the duplicate payment.” A first node asks whether the message requests a refund. Its yes branch reaches a node asking about a duplicate charge; that yes branch ends at a duplicate-billing leaf. The input is a message, the intermediate values are LM judgments, and the output is its category. This fixed example illustrates control flow; the paper learns its trees from data.

The program consists of conditions, branches and return values. A conventional condition tests a numerical threshold or an exact string. A prompt-based condition asks the LM to interpret the input under an instruction. The instruction defines the question; the LM supplies the decision for this particular input.

A path log distinguishes three failure types: the node asks an irrelevant question; the model answers a relevant question incorrectly; or the leaf assigns the wrong class after correct answers. Recording the actual path makes these failures distinguishable.


## What is learned, and what inference costs

Adaptation lives in the selected prompts and tree structure, without updating LM weights. Under one-call-per-node features, a path of depth D takes D LM calls, rather than evaluating every node. The code provides a scikit-learn-style classifier interface.

Keep fitting cost separate from prediction cost. Fitting searches candidate questions and measures their behavior on labeled inputs; serving evaluates the retained path. A large search budget therefore does not imply the same expense for every new prediction.

For an implementation, specify the label set, output parser, stopping rule and behavior on an invalid model answer. Measure accuracy together with average path length and token usage. Two trees with equal depth still differ in cost when their prompts include different numbers of demonstrations. Save the fitted prompts and tree with the model version: changing the LM changes the meaning of its executable conditions.

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## Compare where the language model enters

Aug-Tree expands text features using an LLM during fitting, then deploys an interpretable tree without LM calls. GPTree builds LLM-powered trees and supports expert feedback on decision paths. ACT learns binary natural-language questions with impurity-based selection and TextGrad refinement.

These distinctions identify separate design choices: generating features, answering semantic questions, searching for better questions, and revising the resulting program.

| Method | Node or split | Role of the LM |
| --- | --- | --- |
| Tree Prompting · 2023 | Learned prompt evaluated on the input | Executes branching decisions; dynamic variant also generates prompts |
| Aug-Tree · 2023; preprint 2022 | Disjunction of expanded text features | Constructs features during fitting |
| GPTree · 2024 | LLM-assisted decision rules and split types | Builds decisions with expert-feedback refinement |
| ACT · 2025 | Learned natural-language binary question | Proposes, evaluates and refines questions |

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)
- [Augmenting interpretable models with large language models during training](https://www.nature.com/articles/s41467-023-43713-1)
- [GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees](https://arxiv.org/html/2411.08257v1)
- [ACT: Agentic Classification Tree](https://arxiv.org/html/2509.26433v4)

## When a learned question tree is useful

Use this design when the task has a repeatable decision structure and labeled examples expose which distinctions matter. Intent routing, document classification and categorization all provide a natural setting for asking successive semantic questions. The tree stores task-specific structure outside the model weights.

Choose among example messages to follow their paths through a fixed tree. To train a classifier, use the original paper and code, fit on training examples, select tree size on validation data, and evaluate the saved tree on held-out examples.


## Run the original Tree Prompting notebook

The authors’ [original notebook](https://github.com/csinva/tree-prompt/blob/master/demo.ipynb) uses GPT-2 and Rotten Tomatoes examples to fit TreePromptClassifier, predict held-out labels, compare individual prompts, and draw the learned tree with plot_tree. Follow the [repository installation instructions](https://github.com/csinva/tree-prompt); this notebook downloads the model and dataset.

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## References

- John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. Tree Prompting: Efficient Task Adaptation without Fine-Tuning. EMNLP 2023. https://arxiv.org/html/2310.14034v1
- Chandan Singh, Armin Askari, Rich Caruana, Jianfeng Gao. Augmenting interpretable models with large language models during training. Nature Communications 14, 7913. https://www.nature.com/articles/s41467-023-43713-1
- Sichao Xiong, Yigit Ihlamur, Fuat Alican, Aaron Ontoyin Yin. GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees. arXiv:2411.08257. https://arxiv.org/html/2411.08257v1
- Vincent Grari, Tim Arni, Thibault Laugel, Sylvain Lamprier, James Zou, Marcin Detyniecki. ACT: Agentic Classification Tree. arXiv:2509.26433. https://arxiv.org/html/2509.26433v4
