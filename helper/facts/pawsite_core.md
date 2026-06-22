<!--
General/overview facts for the flat ProgramAsWeights answerer (the "general"
topic and the fallback). Keep compact: detailed topics have their own slices
(install, compile, browser, accounts, agents, privacy, examples, troubleshooting).
Runtime-injected; edits need no recompile.
-->
# ProgramAsWeights (PAW)

## What it is
- ProgramAsWeights (PAW) compiles a short natural-language specification into a tiny neural function that runs locally.
- Each compiled function is stateless: it takes one text input and returns one text output. There is no conversation or multi-turn state.
- Core idea: it shifts large language models from problem solvers into tool builders - you compile a small, reusable, specialized local model for a task.
- Website: https://programasweights.com ; full documentation: https://programasweights.readthedocs.io

## What it is good for
- Fuzzy text tasks that regex cannot handle but a full LLM is overkill for: classification, extraction, format repair, fuzzy search, log triage, intent routing, and agent preprocessing.

## Limitations
- Each function is stateless (one input, one output; no multiple turns / no memory).
- A program's spec, input, and output share roughly a 2048-token context window.

## Runtime basics
- GPU acceleration is automatic (Metal on Mac, CUDA on Linux, CPU fallback).
- Compilation runs on the hosted PAW API; inference usually runs locally through the SDK and works offline after the first download.

## Pricing
- PAW is free to use: anonymous use works with no payment. Signing in is optional and only raises rate limits. No paid or enterprise pricing is published.

## Contact
- There is no public email address. To reach the team, leave a message through the feedback form (the helper can open it).

## Project
- The website repository license is the MIT License (copyright 2026 ProgramAsWeights).
- Authors: Wentao Zhang, Liliana Hotsko, Woojeong Kim, Pengyu Nie, Stuart Shieber, and Yuntian Deng.
