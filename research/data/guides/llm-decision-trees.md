# LLM decision trees: from Tree Prompting to agentic classification

Tree Prompting (EMNLP 2023) learns a decision tree in which a prompted language model makes each branching decision. Its learned prompts and control flow form a reusable program for a classification task. This mechanism connects directly to today’s LLM decision trees, natural-language question trees and agentic classification.

## What Tree Prompting introduced

John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao and Yuntian Deng published Tree Prompting at EMNLP 2023; Morris and Singh contributed equally. The preprint was released on 21 October 2023. Each internal node evaluates a prompt with a frozen LM; its output selects a branch, and a leaf supplies the prediction.

The tree is learned from labeled examples. Candidate prompts include sampled demonstrations, instructions and dynamically generated prompts. In the dynamic version, iPrompt generates candidates for the examples reaching a node, then split quality selects the prompt. Both the node questions and the tree’s branching structure are learned.

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## Reading a prompt tree as a program

Consider an illustrative support classifier. A first node asks whether a message requests a refund. On the yes branch, a second asks whether it describes a duplicate charge. That path returns a billing category; a no answer follows another part of the tree. These example questions illustrate the control flow; they are not a tree reported in the paper.

The program consists of conditions, branches and return values. A conventional condition tests a numerical threshold or an exact string. A prompt-based condition asks the LM to interpret the input under an instruction. The instruction defines the question; the LM supplies the decision for this particular input.

A useful inspection separates three failures. The node asks an irrelevant question; the model answers a relevant question incorrectly; or the leaf assigns the wrong class after correct answers. Recording the actual path makes these failures distinguishable. Editing a leaf does not repair a bad semantic judgment upstream.


## What is learned, and what inference costs

Adaptation lives in the selected prompts and tree structure, without updating LM weights. Under one-call-per-node features, a path of depth D takes D LM calls, rather than evaluating every node. The code provides a scikit-learn-style classifier interface.

Keep fitting cost separate from prediction cost. Fitting searches candidate questions and measures their behavior on labeled inputs; serving evaluates the retained path. A large search budget therefore does not imply the same expense for every new prediction.

For an implementation, specify the label set, output parser, stopping rule and behavior on an invalid model answer. Measure accuracy together with average path length and token usage. Two trees with equal depth still differ in cost when their prompts include different numbers of demonstrations. Save the fitted prompts and tree with the model version: changing the LM changes the meaning of its executable conditions.

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## Compare where the language model enters

Aug-Tree expands text features using an LLM during fitting, then deploys an interpretable tree without LM calls. It is a useful alternative when prediction must run with ordinary feature checks. GPTree builds LLM-powered trees and supports expert feedback on decision paths. ACT learns binary natural-language questions with impurity-based selection and TextGrad refinement.

These distinctions identify separate design choices: generating features, answering semantic questions, searching for better questions, and revising the resulting program. A paper that uses the word “tree” does not by that name specify which of these operations it performs.

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

Examine the complete system rather than the diagram alone. A readable question does not reveal how the LM answered it. Report the path as the executed decision process, then test its nodes on paraphrases, ambiguous inputs and changed facts. If changing the decisive fact leaves the branch unchanged, the node is failing its intended role.

The accompanying illustration lets you follow a fixed tree and change branch choices. To build a learned classifier, start with the original paper and code, fit on training examples, select tree size on validation data, and evaluate the saved tree on held-out examples. Treat the illustration as a mechanism explanation, separate from an empirical accuracy result.


## Run the original Tree Prompting notebook

The authors’ [original notebook](https://github.com/csinva/tree-prompt/blob/master/demo.ipynb) uses GPT-2 and Rotten Tomatoes examples to fit TreePromptClassifier, predict held-out labels, compare individual prompts, and draw the learned tree with plot_tree. Follow the [repository installation instructions](https://github.com/csinva/tree-prompt); this notebook downloads the model and dataset.

- [Tree Prompting: Efficient Task Adaptation without Fine-Tuning](https://arxiv.org/html/2310.14034v1)

## References

- John X. Morris, Chandan Singh, Alexander M. Rush, Jianfeng Gao, Yuntian Deng. Tree Prompting: Efficient Task Adaptation without Fine-Tuning. EMNLP 2023. https://arxiv.org/html/2310.14034v1
- Chandan Singh, Armin Askari, Rich Caruana, Jianfeng Gao. Augmenting interpretable models with large language models during training. Nature Communications 14, 7913. https://www.nature.com/articles/s41467-023-43713-1
- Sichao Xiong, Yigit Ihlamur, Fuat Alican, Aaron Ontoyin Yin. GPTree: Towards Explainable Decision-Making via LLM-powered Decision Trees. arXiv:2411.08257. https://arxiv.org/html/2411.08257v1
- Vincent Grari, Tim Arni, Thibault Laugel, Sylvain Lamprier, James Zou, Marcin Detyniecki. ACT: Agentic Classification Tree. arXiv:2509.26433. https://arxiv.org/html/2509.26433v4
