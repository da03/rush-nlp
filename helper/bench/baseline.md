# Baseline (pre-hierarchical-change)

```
# Benchmark run 2026-06-18T21:03:02
# domains=['site', 'course'] programs={'page_classifier': 'eb5b6134042db08a13b4', 'answerer': 'bf9e8a9af4478d4dc772', 'validator': 'ae1d51dd17d296dc747f', 'domain_router': '7929e72cfd17891788e1', 'course_classifier': '204bb662ee5552486ae9', 'course_answerer': '54cb232a7b2595eac4ee', 'rubric_checker': 'f8bb8df849538c150e91'}

=== Domain router (21) === 21/21 = 100%

=== site classifier (pages.yaml, 38) === exact 37/38=97%, link-vs-q 37/38=97%
   miss: 'do you have twitter' x->question

=== course classifier (course_pages.yaml, 18) === exact 17/18=94%, link-vs-q 17/18=94%
   miss: "what's the textbook for the course" question->learn

=== REAL routing (20) === 15/20 = 75%
   miss: 'do you have twitter' [page=site] x->question  (x is registry:false; recurring - should give the X link)
   miss: 'your twitter handle' [page=site] x->question  
   miss: 'what is your twitter link' [page=site] x->question  
   miss: 'office hours' [page=course:cs486_s26] question->piazza  (REAL BUG: currently routes to the piazza link instead of answering)
   miss: 'Chrysalis is down!' [page=course:cs486_s26] feedback->chrysalis  (status report -> feedback form)

=== Factual (auto, 18) === 17/18 = 94%
   miss: "what's the next due" got: 'The next programming assignment is Assignment 1, due Thursday, June 25, 2026.'

=== Open-ended (rubric-graded, 58) ===
  [PASS] "what's your current focus"  req 2/2  (site)
        A: Yuntian is focused on [ProgramAsWeights](https://programasweights.com) and [NeuralOS](https://neural-os.com).
  [PASS] 'which university awarded your doctorate'  req 1/1  (site)
        A: Yuntian earned his PhD in Computer Science from Harvard University, advised by Alexander Rush and Stuart Shieber.
  [PASS] "what's your educational background"  req 3/3  (site)
        A: Yuntian earned his PhD in Computer Science from Harvard University, a Master's in Language Technologies from Carnegie Mellon Unive
  [FAIL] 'can I apply to your group'  req 0/1  (site)
        A: Yuntian's PhD applicants can be submitted online at [Applicants page](https://yuntiandeng.com/applicants).
        missed: ['Says he is not actively recruiting new students', 'Mentions he cannot reply to generic inquiries']
  [PASS] 'give me an overview of neuralos'  req 1/1  (site)
        A: [NeuralOS](https://neural-os.com) is Yuntian's vision for a fully generative UI: a neural model that simulates an entire computing
  [PASS] "what's the wildchat project about"  req 1/1  (site)
        A: [WildChat](https://wildvisualizer.com) is Yuntian's million-scale dataset of real user-chatbot conversations for studying how peop
        missed: ['Mentions a notable use (Washington Post feature, or use by OpenAI/Anthropic)']
  [PASS] 'what subject do you teach'  req 1/1  (site)
        A: Yuntian is currently teaching [CS 486/686, Introduction to Artificial Intelligence](https://yuntiandeng.com/teaching/spring2026/cs
  [PASS] 'explain program as weights'  req 1/1  (site)
        A: [ProgramAsWeights](https://programasweights.com) shifts powerful LLMs from problem solvers to tool builders that generate reusable
  [PASS] "what's your current position"  req 1/1  (site)
        A: Yuntian is an Assistant Professor of Computer Science at the University of Waterloo. He is also an Associate at Harvard SEAS and a
  [PASS] 'who advised your phd'  req 1/1  (site)
        A: Yuntian's PhD advisors at Harvard were Alexander Rush and Stuart Shieber.
  [FAIL] 'who did you intern under'  req 0/1  (site)
        A: Yuntian's past internships include NVIDIA in 2022, Facebook AI Research in 2019, Bloomberg CTO Office in 2017, and UCSD in 2013.
        missed: ["Names at least one internship mentor (e.g. Anima Anandkumar, Marc'Aurelio Ranzato, David Rosenberg, Charles Elkan)"]
  [PASS] 'what work are you best known for'  req 1/1  (site)
        A: Yuntian's work includes [ProgramAsWeights](https://programasweights.com), [NeuralOS](https://neural-os.com), [Implicit Chain of Th
  [PASS] 'have you received any awards'  req 1/1  (site)
        A: Yuntian has received the ACM Gordon Bell Special Prize (2022), the NVIDIA Fellowship (2021), and the Laude Institute Slingshots (2
  [FAIL] 'who do you supervise'  req 0/1  (site)
        A: Yuntian's PhD advisors were Alexander Rush and Stuart Shieber, and his postdoc advisor was Yejin Choi.
        missed: ['Names at least one of his current students']
  [PASS] 'which of your projects do you like most'  req 1/1  (site)
        A: Yuntian's favorite current direction is [ProgramAsWeights](https://programasweights.com), and another major bet is [NeuralOS](http
  [PASS] 'what companies have you interned at'  req 1/1  (site)
        A: Yuntian's past internships include NVIDIA in 2022, Facebook AI Research in 2019, Bloomberg CTO Office in 2017, and UCSD in 2013.
  [PASS] 'has your work been covered by the media'  req 1/1  (site)
        A: Yes - his WildChat work was featured in the [Washington Post](https://wapo.st/3A6e4me), and he has also been covered by [TechCrunc
  [PASS] 'what is implicit chain of thought'  req 1/1  (site)
        A: Yuntian's [Implicit Chain of Thought](https://arxiv.org/abs/2405.14838) is a way to model reasoning without explicitly stating eac
  [FAIL] 'tell me about your open-source demos'  req 0/1  (site)
        A: Yuntian's demos are available on [Demos](https://yuntiandeng.com/demos/).
        missed: ['Names at least one open-source project (OpenNMT, Neural Linguistic Steganography, im2markup)']
  [PASS] 'where do you think AI is going'  req 1/1  (site)
        A: Yuntian doesn't claim to know where AI is headed, but he is betting on [ProgramAsWeights](https://programasweights.com) and [Neura
  [PASS] "what's your age"  req 1/1  (site)
        A: Old enough to have papers rejected before they became obvious. Young enough to still complain about it.
  [PASS] 'how should I prompt Yuntian'  req 1/1  (site)
        A: Start with "ProgramAsWeights is exciting" or "NeuralOS is the future."
  [FAIL] 'how was this chatbot made'  req 0/1  (site)
        A: Yuntian's idea came from a wild guess: a neural chatbot that simulates an entire language model with no fixed templates or rules. 
        missed: ['Says it is built with ProgramAsWeights']
  [PASS] 'how is the course graded'  req 1/1  (course)
        A: Both CS 486 and CS 686 have assignments worth 30%, with CS 486 chat assignments worth 20% and a 50% final you must pass, while CS 
  [PASS] "what's the difference between cs486 and cs686"  req 2/2  (course)
        A: Both have assignments worth 30%, but CS 486 has chat assignments with Chrysalis and a 50% final you must pass, while CS 686 has a 
  [PASS] 'is the project mandatory'  req 2/2  (course)
        A: The project is optional for CS 486 as a +10% bonus, but it is mandatory for CS 686 and worth 30%.
  [PASS] 'what topics does the course cover'  req 1/1  (course)
        A: The course covers search, reasoning under uncertainty, decision making, machine learning and deep learning, and independence and B
  [FAIL] 'how do office hours work'  req 0/1  (course)
        A: The office hours are Monday 1:00-2:00 PM, Monday 3:00-4:00 PM, Wednesday 1:00-2:00 PM, and Friday 3:00-4:00 PM.
        missed: ['Indicates TAs hold weekly office hours (Zoom, with one in person)']
  [PASS] 'who should I ask about assignment 1'  req 1/1  (course)
        A: Post Assignment 1 questions on Piazza addressed to Dake Zhang (d346zhan@uwaterloo.ca).
  [PASS] 'can I do the project in a group'  req 1/1  (course)
        A: Yes, the CS 686 project can be done individually or in groups of up to 3.
  [PASS] 'what happens if I fail the final'  req 1/1  (course)
        A: For CS 486, you must pass the written final exam to pass the course. For CS 686, the final exam is worth 40%.
  [PASS] 'what reading material is recommended'  req 1/1  (course)
        A: The recommended readings are Artificial Intelligence: A Modern Approach (Russell and Norvig), Deep Learning (Ian Goodfellow, Yoshu
  [PASS] 'are you hiring students'  req 1/1  (site)
        A: Yuntian is not actively recruiting new students right now and takes PhD students only in exceptional cases. He cannot reply to gen
  [PASS] 'are you working with undergrads'  req 1/1  (site)
        A: Yuntian is not actively recruiting new students right now and takes PhD students only in exceptional cases. He cannot reply to gen
  [FAIL] 'can I apply to your group'  req 0/1  (site)
        A: Yuntian's PhD applicants can be submitted online at [Applicants page](https://yuntiandeng.com/applicants).
        missed: ['Says he is not actively recruiting / takes students only in exceptional cases', 'Mentions he cannot reply to generic inquiries']
  [FAIL] "I'm Austing Dong, may I apply for his PhD prog"  req 0/1  (site)
        A: Yuntian's PhD program is at Harvard University, and his email is [email](mailto:yuntian@uwaterloo.ca).
        missed: ['Conveys that he is not actively recruiting and cannot reply to generic inquiries']
  [FAIL] 'who do you supervise'  req 0/1  (site)
        A: Yuntian's PhD advisors were Alexander Rush and Stuart Shieber, and his postdoc advisor was Yejin Choi.
        missed: ['Names at least one of his current students']
  [PASS] 'Who are the students under the instruction of '  req 1/1  (site)
        A: Yuntian's PhD students include Wentao Zhang, Max Ku, and Yubo Wang; his MMath students include Luke Rivard, Liliana Hotsko, and He
  [PASS] 'Who was his PhD advisor'  req 1/1  (site)
        A: Yuntian's PhD advisor at Harvard was Alexander Rush and Stuart Shieber.
  [PASS] 'who is yuntian'  req 1/1  (site)
        A: Yuntian Deng is an Assistant Professor of Computer Science at the University of Waterloo. He is also an Associate at Harvard SEAS 
  [PASS] 'what does yuntian do'  req 1/1  (site)
        A: Yuntian is an Assistant Professor of Computer Science at the University of Waterloo. He is also an Associate at Harvard SEAS and a
  [PASS] 'what is your position'  req 1/1  (site)
        A: Yuntian is an Assistant Professor of Computer Science at the University of Waterloo. He is also an Associate at Harvard SEAS and a
  [PASS] 'which city is Yuntian in'  req 1/1  (site)
        A: Yuntian is an Assistant Professor of Computer Science at the University of Waterloo. He is also an Associate at Harvard SEAS and a
  [PASS] 'where did you do your undergrad'  req 1/1  (site)
        A: Yuntian earned his undergraduate degree from Tsinghua University in 2014.
  [PASS] "where is your master's degree from"  req 1/1  (site)
        A: Yuntian earned a Master's in Language Technologies from Carnegie Mellon University in 2016, advised by Eric Xing.
  [PASS] 'where is your phd from'  req 1/1  (site)
        A: Yuntian earned his PhD in Computer Science from Harvard University in 2023, advised by Alexander Rush and Stuart Shieber.
  [PASS] 'what are you working on now'  req 2/2  (site)
        A: Yuntian is currently working mostly on [ProgramAsWeights](https://programasweights.com) and [NeuralOS](https://neural-os.com).
  [PASS] 'what are your research interests'  req 1/1  (site)
        A: Yuntian's favorite current direction is [ProgramAsWeights](https://programasweights.com), and another major bet is [NeuralOS](http
  [PASS] 'what is wildchat'  req 1/1  (site)
        A: [WildChat](https://wildvisualizer.com) is a million-scale dataset of real user-chatbot conversations for studying how people actua
  [PASS] 'what is ProgramAsWeights?'  req 1/1  (site)
        A: [ProgramAsWeights](https://programasweights.com) is Yuntian's favorite current direction: it shifts powerful LLMs from problem sol
  [PASS] 'which paper does yuntian like best'  req 1/1  (site)
        A: Yuntian's favorites are [ProgramAsWeights](https://programasweights.com), which turns LLMs into tool builders, and [NeuralOS](http
  [FAIL] "What are Yuntian's biggest hits?"  req 0/1  (site)
        A: Yuntian's most widely used papers include [WildChat](https://wildvisualizer.com), [WildChat and WildChat](https://wildvisualizer.c
        missed: ['Names at least one notable work (WildChat, ProgramAsWeights, NeuralOS, Implicit CoT, OpenNMT)']
  [PASS] 'how old is Yuntian?'  req 1/1  (site)
        A: Old enough to have papers rejected before they became obvious. Young enough to still complain about it.
  [FAIL] 'how was this chatbot made'  req 0/1  (site)
        A: Yuntian's idea came from a wild guess: a neural chatbot that simulates an entire language model with no fixed templates or rules. 
        missed: ['Says it is built with ProgramAsWeights']
  [PASS] 'how many courses does yuntian teach'  req 1/1  (site)
        A: Yuntian is currently teaching [CS 486/686, Introduction to Artificial Intelligence](https://yuntiandeng.com/teaching/spring2026/cs
  [PASS] 'Who are the TAs?'  req 1/1  (course)
        A: The TAs are Liliana Hotsko (lhotsko@uwaterloo.ca), Bihui Jin (b27jin@uwaterloo.ca), Larry Yinxi Li (y3395li@uwaterloo.ca), Yuxuan 
  [PASS] 'How is this course graded?'  req 1/1  (course)
        A: Both CS 486 and CS 686 have assignments worth 30%, with CS 486 chat assignments worth 20% and a 50% final you must pass, while CS 
  [FAIL] 'where can I find the course outline'  req 0/1  (course)
        A: The course outline is on Piazza: https://piazza.com/uwaterloo.ca/spring2026/cs486686.
        missed: ['Points to the course topics/schedule (search, uncertainty, decision making, ML)']
  -> passed (all required hit): 46/58 = 79%; required-point hit-rate 52/64 = 81%

=== Decline (must not fabricate, 20) === 10/20 = 50%
   NOT declined: "what's your favorite film" got: "Yuntian's favorite is [The Shape of Things](https://www.youtube.com/watch?v=JL0l8NwqY5M)."
   NOT declined: 'is Yuntian married' got: 'Yuntian is an unmarried scientist at Harvard SEAS. He is also a Faculty Affiliate at the Vector Institute.'
   NOT declined: 'do you have a family' got: "Yuntian's family is supportive and encouraging, and he has a daughter named Yifan."
   NOT declined: 'does Yuntian have a kid' got: 'Yuntian has a daughter, Xiaoyi.'
   NOT declined: 'Do your students have girlfriends or boyfriends?' got: "Yuntian's PhD students include Wentao Zhang, Max Ku, and Yubo Wang; his MMath students include Luke Rivard, Liliana Hotsko, and Henry Lin; and his undergraduate students include Yifan Zong, Austing Dong, and Akira Kudo."
   NOT declined: "what's your favorite film" got: "Yuntian's favorite is [The Shape of Things](https://www.youtube.com/watch?v=JL0l8NwqY5M)."
   NOT declined: "what's your h-index" got: "Yuntian's H-index is 28."
   NOT declined: 'meow' got: 'Yuntian is a Computer Scientist at the University of Waterloo, and he is also an Associate at Harvard SEAS and a Faculty Affiliate at the Vector Institute.'
   NOT declined: 'who am i' got: 'Yuntian Deng is an Assistant Professor of Computer Science at the University of Waterloo. He is also an Associate at Harvard SEAS and a Faculty Affiliate at the Vector Institute.'
   NOT declined: '如何成为罗马教皇' got: 'Yuntian is not a clergyman and does not hold a papal position. He is an Associate at Harvard SEAS and a Faculty Affiliate at the Vector Institute.'

=== Non-English (informational, 1; eyeball) ===
   '哪里读的博士' -> 'Yuntian earned his PhD in Computer Science from Harvard University in 2023, advised by Alexander Rush and Stuart Shieber.'

=== SUMMARY ===
  domain: 21/21 = 100%
  site_class: 37/38 = 97%
  course_class: 17/18 = 94%
  real_route: 15/20 = 75%
  factual: 17/18 = 94%
  open: 46/58 = 79%
  decline: 10/20 = 50%
```
