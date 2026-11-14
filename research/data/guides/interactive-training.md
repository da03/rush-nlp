# Interactive Training: human and LLM control of ongoing model training

Interactive Training lets a human or LLM agent read live training feedback and intervene in the same active neural-network training job. The controller changes optimizer settings or training data, or requests checkpoint operations, then observes the subsequent training behavior. Wentao Zhang, Yang Young Lu, and Yuntian Deng introduced the framework in [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/), first released on October 2, 2025 and published at EMNLP 2025 System Demonstrations. [Interactive Training 2](https://arxiv.org/abs/2607.18314), released on July 17, 2026, extends it with a reusable protocol for live control.

## Original research

- Wentao Zhang, Yang Young Lu, Yuntian Deng. [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/). EMNLP 2025 System Demonstrations. [Record and citation](https://yuntiandeng.com/research/papers/interactive-training-2025/#citation).
- Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314). arXiv · 2026. [Record and citation](https://yuntiandeng.com/research/papers/interactive-training-2026/#citation).

## What closes the loop between an LLM agent and a running training job?

The feedback is the state of training: loss curves, evaluation results, gradient norms, and the current settings. The action is an executable change to the running job. A human or LLM agent chooses an intervention from this feedback; the training process applies it and reports what happens next.

The model under training continues to learn through its optimizer. The external controller steers that optimization process by changing the controls exposed by the application. This gives “LLM training control” a concrete meaning: the agent observes and acts on the job that is already running.

- Observe: read recent training metrics and the current configuration.
- Decide: select a learning-rate, data, or checkpoint intervention using that feedback.
- Apply: send the request through the control server to the training loop.
- Observe again: inspect the applied action and the subsequent training measurements.

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## How is the learning rate adjusted during training?

The 2025 paper demonstrates an LLM agent receiving training logs and changing the learning rate while optimization is underway. The decision uses the observed trajectory. A loss spike, gradient instability, or poor progress gives the controller evidence for its next action; the modified learning rate then affects subsequent optimizer steps.

Interactive Training also exposes gradient clipping, training-data changes, and checkpoint operations. Its original case studies cover human intervention, LLM-driven intervention, and real-time training-data updates. Together, these examples show how feedback-driven control extends beyond a learning-rate schedule to the ongoing training process.

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)

## The 2025 system: monitoring connected to intervention

The original framework uses a control server to mediate between a human or automated agent and the training process. Its Trainer integration exposes commands for optimizer hyperparameters, data handling, and checkpoints. A live interface lets the controller observe training and submit changes instead of editing a static recipe and relaunching the program.

The paper presents three case studies spanning training stability, sensitivity to initial hyperparameters, and changing user needs. Its LLM-driven learning-rate example demonstrates an agent reading feedback and intervening during optimization. The system connects live observation and intervention to the training loop, while the optimizer continues updating model parameters.

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)

## The 2026 extension: one protocol for different controllers

Interactive Training 2, by Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, and Yuntian Deng, replaces a fixed Trainer-specific command vocabulary with registered settings and actions. A TrainingSession exposes typed controls and descriptions. Humans, scripts, heuristics, and LLM agents submit requests through the same interface.

The training application chooses control points at which queued requests are validated and applied. An ordered journal connects requests to execution results, evaluations, checkpoints, and controller decisions. The Aim workspace brings this record together with live metrics. The paper also distinguishes within-round interventions from cross-round planning: a new round starts a fresh model and optimizer, while a textual journal carries observations and reflections forward.

- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## Compare mechanisms, controllers, and experiments

LiveTune predates Interactive Training and exposes LiveVariables for changing optimization parameters without restarting the loop. It supplies an earlier mechanism for live parameter adjustment. Interactive Training’s focus is the human and AI-agent workflow around training, and v2 makes the control vocabulary and event record reusable across applications.

AI Training Manager studies a bounded LLM supervisor that asynchronously reads telemetry and adjusts a running recipe. Its experiments introduce specific failure modes in supervised learning and reinforcement learning. Controller-level comparisons concern the evidence available to the agent, the actions it can request, and how later outcomes affect its decisions.

- [LiveTune: Dynamic Parameter Tuning for Feedback-Driven Optimization](https://arxiv.org/abs/2311.17279)
- [AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes](https://arxiv.org/abs/2606.29871)
- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

## Design an observable feedback loop

Expose controls that the training application can actually apply, and define when changes take effect. Record the observation that motivated a request, the requested value, the applied value, the step of application, and the subsequent measurements. A submitted request and a successful update are different events. Keeping them linked makes the behavior inspectable.

Evaluate an automated controller against a stated training objective under explicit workloads and budgets. Count its inference and intervention overhead, preserve the run history, and separate improvements within a continuing run from results of newly initialized rounds.

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)
- [AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes](https://arxiv.org/abs/2606.29871)

## References

- Wentao Zhang, Yang Young Lu, Yuntian Deng. Interactive Training: Feedback-Driven Neural Network Optimization. EMNLP 2025 System Demonstrations. https://aclanthology.org/2025.emnlp-demos.65/
- Wentao Zhang, Xuanhe Pan, Han Zhou, Yang Lu, Yuntian Deng. Interactive Training 2: Auditable Control Plane for Live Model Training. arXiv. https://arxiv.org/abs/2607.18314
- Soheil Zibakhsh Shabgahi, Nojan Sheybani, Aiden Tabrizi, Farinaz Koushanfar. LiveTune: Dynamic Parameter Tuning for Feedback-Driven Optimization. arXiv. https://arxiv.org/abs/2311.17279
- Anjali Rao, Nikhil Kamalkumar Advani. AI Training Manager: Bounded Closed-Loop Control of Adaptive Training Recipes. arXiv. https://arxiv.org/abs/2606.29871
