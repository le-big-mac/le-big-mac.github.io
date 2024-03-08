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

<details>
  <summary>Solution</summary>
  H, B, K, K, H, B, B, K, H
</details>

**Update (2024-03-08):**

Claude 3 (specifically claude-3-opus-20240229) answered this correctly with no prompt engineering. It's so over.

Here's the full output for the curious:

<hr>

Great! Let's solve this problem step by step. We need to find the finishing positions of each trainer's horses, given that all three trainers tied on points.

Given:
  - There are 9 horses in total, 3 from each trainer.
  - Points are awarded based on the finishing position: 9 points for 1st place, 8 points for 2nd place, and so on, down to 1 point for 9th place.
  - Two of Kate's horses had a photo finish, and her third horse finished further back.
  - Harry's horse, Bored Bronco, finished last.

Step 1: Determine the total points awarded in the race.
Total points = 9 + 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1 = 45

Step 2: Since the trainers tied on points, each trainer must have scored 45 ÷ 3 = 15 points.

Step 3: Considering Kate's horses, let's assume the two photo-finish horses finished in positions x and x+1, and her third horse finished in position y.
Kate's points = x + (x+1) + y = 15
2x + y + 1 = 15
2x + y = 14

Step 4: Since Bored Bronco finished last, Harry's other two horses must have finished in positions totaling 14 points (15 - 1 = 14).
The only two positions that add up to 14 points are 5th (5 points) and 9th (9 points).

Step 5: By elimination, Britney's horses must have finished in the remaining positions: 3rd, 4th, and 8th.

Step 6: Now, we can solve for Kate's horses' positions using the equation from Step 3.
If x = 1, then y = 12, which is not possible as there are only 9 horses.
If x = 2, then y = 10, which is also not possible.
If x = 3, then y = 8, which works.

Therefore, Kate's horses finished in 3rd, 4th, and 8th positions.

In summary:
- Kate's horses: 3rd, 4th, and 8th
- Britney's horses: 2nd, 6th, and 7th
- Harry's horses: 1st, 5th, and 9th

<hr>

While the arithmetic is slightly spotty, the solution is correct, and it does seem to have reasoned through the problem.
