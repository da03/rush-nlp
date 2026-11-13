---
layout: page
title: From AI as Problem Solver to AI as Tool Builder
description: "Pretrain models to produce other models: Yuntian Deng's vision for Program-as-Weights, reusable neural programs, and software people build in natural language."
permalink: /ai-as-tool-builder/
date: 2026-06-05T21:12:19Z
last_modified_at: 2026-11-13
author: Yuntian Deng
og_type: article
---
<header class="post-header">
  <h1 class="post-title">{{ page.title }}</h1>
  <p class="post-meta"><a href="/">Yuntian Deng</a> · <time datetime="{{ page.date | date_to_xmlschema }}">June 5, 2026</time> · <a href="https://x.com/yuntiandeng/article/2063006022344536306">Original on X</a></p>
</header>

Imagine a future "SoftwareGPT".

You buy a new household cleaning robot. You take a few pictures of your rooms. You describe a few rules: avoid the cables in that corner.

Then SoftwareGPT generates a 20MB neural program.

You load it into your robot.

And that's it. Your robot now cleans your house perfectly, without ever calling a big cloud model again.

This is the future we are entering.

## Not AI as problem solver, but AI as tool builder

Right now, we mostly use AI as a problem solver.

You ask a question -> it gives an answer.

But many tasks are not one-off questions.

They are **repeated** routines.

A cleaning robot doesn't clean your house once. It cleans it every day.

This is exactly why traditional software was invented.

When a task repeats, we do not want to solve it from scratch every time. We want a reusable tool.

I believe AI should do the same, but with **models** instead of code.

## Use AI to Compile Tasks into Reusable Neural Programs

Instead of asking a giant model to solve the same task over and over, we ask it **once** to compile a small, specialized neural model that solves this task forever.

The generated model is the neural program, the new form of software.

But by software, I do not mean code. I mean models.

## Don't we already use AI to build software?

We already use AI to generate code. But the output is still traditional code that lives inside the old software stack.

In the future I'm describing, the output is not code.

It's a model, a neural program.

## What does this future look like?

Every device becomes AI-native.

Your laptop, phone, car, fridge, and cleaning robot can all run neural programs the same way today's hardware runs binaries.

In fact, neural programs may become even more universal than traditional software. The underlying operations are mostly matrix multiplication and nonlinearities. No more "this app no longer runs because the new Mac drops support for 32-bit programs".

You do not ask the large cloud model every time.

You do not need a company to have access to your private data forever.

You do not need your fridge to get a gold medal in math or recite Shakespeare.

You compile a neural program once, then run many times.

For the cleaning robot, the large SoftwareGPT may live in the cloud. It may understand many kinds of homes and many cleaning constraints. But the model it generates for your robot only needs to understand your home.

If you later refurnish your living room, you simply tell SoftwareGPT:

Here is what changed, please upgrade my robot's software.

The neural software gets patched, just like regular software.

## Why not just run a small pretrained model locally?

A small general model has to compress the entire world. It can't be excellent at **your** house.

A specialized neural program spends **all** its capacity on exactly what matters to you.

Prompting alone is insufficient to specialize, as it can only elicit what's already latent in a model.

Finetuning requires data most users don't want to collect themselves.

## Why not generate code instead?

Practically: not all tasks can be solved by code. Recognizing the cable in the corner, understanding whether a message is urgent --- these are inherently fuzzy tasks that are painful (or impossible) to express in code.

Technically: generating discrete code tokens is hard to train end-to-end. Generating continuous weights is differentiable --- it lets us actually train a compiler for tool building, just like how we train models for problem solving.

Philosophically: programming languages were invented for humans. When both the builder and the executor are machines, why force everything through a human language? Just output the weights directly.

## What do we need to get there?

Our current training paradigm mostly trains problem solvers.

ChatGPT is trained to generate the correct output answer given an input question.

But if we want AI to become a tool builder, we need a new training paradigm.

We should pretrain models to produce other models that answer questions.

The objective changes from: Given this input, what is the correct output?

to: Given this task, what model should I generate so that it can generate the correct output for any input?

## This is what we're building with ProgramAsWeights

We trained a compiler that turns natural language descriptions into neural programs.

Example: "write me a function that classifies whether a message is urgent"

The compiler then generates a neural program that runs locally and beats prompting the same-size model by a huge margin.

We've already shipped real examples, all running on local CPUs:

1. The helper bot on my personal site ([yuntiandeng.com/#ask](https://yuntiandeng.com/#ask))

2. A 3D avatar you can control with natural language instructions ([programasweights.com/avatar](https://programasweights.com/avatar))

3. A word guessing game where the alien has to guess your secret word from your clues ([programasweights.com/alien](https://programasweights.com/alien))

## From software consumers to software producers

The web changed us from content consumers into content producers.

AI is about to do the same for software.

In the future, normal people won't just buy software built by companies.

We will compile our own, in natural language, for the repeated tasks in our lives.

The web made everyone a content producer.

AI will make everyone a software producer.

---

## Program-as-Weights research

[Program-as-Weights: A Programming Paradigm for Fuzzy Functions](https://arxiv.org/abs/2607.02512), by Wentao Zhang, Liliana Hotsko, Woojeong Kim, Pengyu Nie, Stuart Shieber, and Yuntian Deng. NeurIPS 2026. First released July 2, 2026.

PAW introduces fuzzy-function programming and the compiler–interpreter interface for building reusable local neural programs. Read [how PAW builds and runs neural tools](https://programasweights.com/research/ai-as-tool-builder/), the [research overview](https://programasweights.com/research/), or [download the paper's BibTeX](https://programasweights.com/reading-list/papers/2607.02512/citation.bib).

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": "https://yuntiandeng.com/ai-as-tool-builder/#article",
  "url": "https://yuntiandeng.com/ai-as-tool-builder/",
  "mainEntityOfPage": "https://yuntiandeng.com/ai-as-tool-builder/",
  "headline": {{ page.title | jsonify }},
  "description": {{ page.description | jsonify }},
  "datePublished": {{ page.date | date_to_xmlschema | jsonify }},
  "dateModified": {{ page.last_modified_at | date: '%Y-%m-%d' | jsonify }},
  "inLanguage": "en",
  "author": {"@type": "Person", "name": "Yuntian Deng", "url": "https://yuntiandeng.com/"},
  "publisher": {"@type": "Person", "name": "Yuntian Deng", "url": "https://yuntiandeng.com/"},
  "sameAs": "https://x.com/yuntiandeng/article/2063006022344536306",
  "citation": {
    "@type": "ScholarlyArticle",
    "headline": "Program-as-Weights: A Programming Paradigm for Fuzzy Functions",
    "url": "https://arxiv.org/abs/2607.02512",
    "datePublished": "2026-07-02",
    "isPartOf": {"@type": "CreativeWork", "name": "The Fortieth Annual Conference on Neural Information Processing Systems"},
    "author": [
      {"@type": "Person", "name": "Wentao Zhang"},
      {"@type": "Person", "name": "Liliana Hotsko"},
      {"@type": "Person", "name": "Woojeong Kim"},
      {"@type": "Person", "name": "Pengyu Nie"},
      {"@type": "Person", "name": "Stuart Shieber"},
      {"@type": "Person", "name": "Yuntian Deng"}
    ]
  }
}
</script>
