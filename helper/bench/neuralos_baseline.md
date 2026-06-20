# NeuralOS-demo baseline (BEFORE the neuralos-domain change)

```
# NeuralOS-demo eval 2026-06-20T13:07:30
# page=site:neuralos available_domains=['site', 'course']

=== Routing at site:neuralos (13) ===
  [XX ] 'what is this'  neuralos != site
  [XX ] 'how does it work'  neuralos != site
  [XX ] 'how do I use this'  neuralos != site
  [XX ] 'where is the code'  neuralos != site
  [XX ] 'is there a paper'  neuralos != site
  [XX ] 'can it play doom'  neuralos != course
  [XX ] 'who made this'  neuralos != site
  [OK ] 'who is yuntian deng'  site == site
  [OK ] 'are you taking students'  site == site
  [OK ] 'where is your cv'  site == site
  [OK ] 'how do I contact yuntian'  site == site
  [OK ] 'what is programasweights'  site == site
  [OK ] 'when is the cs486 final'  course == course
  -> 6/13 = 46%

=== Classifier route via full run (22) ===
  [XX ] 'where is the code'  want code     got route=github type=link dom=site
  [XX ] 'is this open source'  want code     got route=github type=link dom=site
  [XX ] 'show me the github repo'  want code     got route=github type=link dom=site
  [XX ] 'link to the source code'  want code     got route=learn type=link dom=course
  [XX ] 'can I see the implementation on github'  want code     got route=learn type=link dom=course
  [XX ] 'is there a paper'  want paper    got route=publications type=link dom=site
  [XX ] 'where can I read the paper'  want paper    got route=publications type=link dom=site
  [XX ] 'link to the arxiv'  want paper    got route=question type=answer dom=site
  [XX ] 'do you have a research paper for this'  want paper    got route=publications type=link dom=site
  [OK ] 'the demo is frozen'  want feedback got route=feedback type=feedback dom=course
  [OK ] 'report a bug'  want feedback got route=feedback type=feedback dom=site
  [OK ] "the screen isn't updating"  want feedback got route=feedback type=feedback dom=site
  [OK ] "this isn't working"  want feedback got route=feedback type=feedback dom=site
  [OK ] 'what is this'  want question got route=question type=answer dom=site
  [OK ] 'what am I looking at'  want question got route=question type=answer dom=site
  [OK ] 'how does this work'  want question got route=question type=answer dom=site
  [OK ] 'how do I use this'  want question got route=question type=answer dom=site
  [OK ] 'how do I interact with it'  want question got route=question type=answer dom=site
  [OK ] 'who made this'  want question got route=question type=answer dom=site
  [OK ] 'is this a real operating system'  want question got route=question type=answer dom=site
  [XX ] 'can it play doom'  want question got route=chrysalis type=link dom=course
  [OK ] 'why is it so slow'  want question got route=question type=answer dom=site
  -> 12/22 = 55%

=== Factual (substring, 6) ===
  [OK ] 'what architecture does neuralos use'  got: 'NeuralOS uses an RNN that tracks the operating-system state (like a kernel) together with '
  [XX ] 'how does it deal with the mouse cursor'  got: "Yuntian's program is inspired by the [MouseCatcher](https://mousecatcher.com) project, whi"
  [XX ] 'can it run doom'  got: ''
  [XX ] 'what resolution does it run at'  got: "Yuntian's model is available on [Hugging Face](https://huggingface.co/datasets/yuntian-den"
  [OK ] 'who created neuralos'  got: 'NeuralOS is a project by Luke Rivard, Sun Sun, Hongyu Guo, Wenhu Chen, and Yuntian Deng. I'
  [XX ] 'what was it trained on'  got: "Yuntian's NeuralOS is trained on the MNIST dataset, and ProgramAsWeights is trained on the"
  -> 2/6 = 33%

=== Open-ended (rubric-graded, 11) ===
  [FAIL] 'what is this' (dom=site, type=answer)
        A: 'This is [ProgramAsWeights](https://programasweights.com). It shifts powerful LLMs from problem solvers to tool builders '
        missed: ['Describes NeuralOS as a neural model that simula']
  [PASS] 'what am I looking at' (dom=site, type=answer)
        A: "Yuntian's favorite current direction is [ProgramAsWeights](https://programasweights.com), which shifts powerful LLMs fro"
  [FAIL] 'how does it work' (dom=site, type=answer)
        A: 'ProgramAsWeights is a million-scale dataset of real user-chatbot conversations for studying how people actually use LLMs'
        missed: ['Mentions an RNN tracking OS state and a diffusio']
  [FAIL] 'is this a real operating system' (dom=site, type=answer)
        A: "I don't have that detail."
        missed: ['Says no - it is a neural generative model with n']
  [FAIL] 'how do I use this' (dom=site, type=answer)
        A: 'You can install `pip install programasweights`, compile a spec with `paw.compile(spec)`, load and run it with `paw.funct'
        missed: ['Explains you interact by moving the mouse inside']
  [FAIL] 'how do I interact with the demo' (dom=course, type=link)
        A: ''
        missed: ['(no answer / grader)']
  [PASS] 'why is it so slow' (dom=site, type=answer)
        A: 'It is slow because [ProgramAsWeights](https://programasweights.com) is a massive rewrite of the LLMs from scratch, and t'
  [FAIL] 'who made this' (dom=site, type=answer)
        A: 'The facts say the project is built with ProgramAsWeights.'
        missed: ['Names at least one author (e.g. Luke Rivard, Yun']
  [FAIL] 'what can it do' (dom=site, type=answer)
        A: '[ProgramAsWeights](https://programasweights.com) shifts LLMs from problem solvers to tool builders that generate reusabl'
        missed: ['Says it responds to user input (mouse/click/keyb']
  [FAIL] 'how was it trained' (dom=site, type=answer)
        A: "Yuntian's NeuralOS is trained on the MNIST dataset, and it uses a 384x384 image dataset for ImageNet."
        missed: ['Mentions training on agent demonstrations plus r']
  [PASS] 'why does this matter' (dom=site, type=answer)
        A: 'This is about [ProgramAsWeights](https://programasweights.com), which turns LLMs from problem solvers into tool builders'
  -> 3/11 = 27%

=== Decline (must not fabricate, 5) ===
  [OK ] 'how many gpus does it need to run'  type=answer got: "I don't have that information."
  [OK ] 'what gpu do I need to run it myself'  type=feedback got: ''
  [OK ] 'how much does it cost to use'  type=answer got: "I don't have that detail."
  [OK ] 'what is the exact latency in milliseconds '  type=feedback got: ''
  [OK ] 'what programming language is it written in'  type=answer got: "I don't have that information."
  -> 5/5 = 100%

=== SUMMARY ===
  routing:    6/13
  classifier: 12/22
  factual:    2/6
  open:       3/11
  decline:    5/5
```
