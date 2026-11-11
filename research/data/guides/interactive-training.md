# Controlling a running training job with humans and AI agents

Interactive Training: Feedback-Driven Neural Network Optimization, by Wentao Zhang, Yang Young Lu, and Yuntian Deng, makes an ongoing neural-network training process controllable by humans and AI agents. First released on October 2, 2025 and published at EMNLP 2025 System Demonstrations, it exposes optimizer settings, training data, and checkpoints through a control server. Interactive Training 2 extends this approach to a reusable protocol for live training, released on arXiv on July 17, 2026.

## Make the running process the object of control

A training dashboard shows loss curves and evaluations. Interactive control connects those observations to changes in the process that is producing them. A researcher sees instability, changes the learning rate, and observes subsequent updates in the same run. An LLM controller uses the same feedback cycle: inspect evidence, request an intervention, and inspect its effect.

This differs from choosing a configuration before launch or proposing a new experiment after a run finishes. The active model and optimizer continue while exposed controls change. A checkpoint restore or a new round is a separate operation with its own state transition; the interface should record which operation actually occurred.

- [Interactive Training: Feedback-Driven Neural Network Optimization](https://aclanthology.org/2025.emnlp-demos.65/)
- [Interactive Training 2: Auditable Control Plane for Live Model Training](https://arxiv.org/abs/2607.18314)

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

AI Training Manager studies a bounded LLM supervisor that asynchronously reads telemetry and adjusts a running recipe. Its experiments introduce specific failure modes in supervised learning and reinforcement learning. Controller-level comparisons concern the evidence available to the agent, the actions it can request, and how later outcomes affect its decisions. Infrastructure support and measured controller performance are distinct contributions.

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
