---
layout: post
title:  "This is the BEST prompt to tell if your LLM can TRULY reason!"
date:   2024-03-04
image: /assets/images/2024-03-04-this-is-the-best-prompt-to-tell-if-your-llm-can-truly-reason/soy.jpeg
---

**Prompt:**
Hello, I'd like your help in solving the following problem.

Three top racehorse trainers, Kate Winsalot, Britney Spurs and Harry Trotter, were invited to compete in the prestigious Champion Trainers Stakes.
Each had to enter three horses in the race, with points being awarded to the trainer according to the finishing position of their mounts. The trainer of the winning animal would be awarded 9 points, the second placed horse 8 points, and so on, down to 1 point for the trainer of the last horse. The person receiving the most points is the Champion Trainer.
The results of the race were delayed waiting for Bored Bronco, one of Harry’s horses, to finally finish and also because two of Kate’s runners had to have their positions determined by photograph, with her third horse finishing further back.
When the scores were calculated, it turned out that the three trainers had tied on points.
What were the finishing positions of each trainers’ horses?

**LLM Answer:**
*Inevitably wrong, often infuriating.*

I’ve tried this prompt on Bing Copilot, Perplexity (with GPT-4 and no internet search), and Gemini Advanced, and so far none have correctly reasoned through and answered the question. Even with significant further prompting, only GPT-4 was close to the correct solution. **Therefore, I have determined that this is the new Turing test, and the definitive check of whether an LLM can reason** (not really, but if you want to kill an hour, trying to adjust the prompt so that Gemini Advanced gets the correct answer is kind of fun).

**Update (2024-03-08):** claude-3-opus-20240229 answered this correctly with no prompt engineering. It's so over.

<details>
  <summary>Solution</summary>
  H, B, K, K, H, B, B, K, H
</details>
