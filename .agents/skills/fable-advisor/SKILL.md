---
name: fable-advisor
description: Use Fable 5 only as a bounded advisor for expensive NCSW product, architecture, methodology, or launch decisions. Do not use for repo exploration, implementation, data discovery, long log reading, browser verification, or subagent fan-out.
---

# Fable Advisor

Codex is the working agent. Fable is the advisor of last responsible resort.

Use this skill when the project needs high-quality judgment, not labor. Good uses include product strategy, architecture risk, methodology critique, launch readiness, payments/accounts/community scope, and deciding between two plausible plans after Codex has gathered evidence.

## Do Not Use Fable For

- finding files or data
- reading large logs or PDFs
- searching the repo
- implementation
- running tests
- browser or computer-use verification
- subagents or workflows
- "go figure it out" prompts
- unclear source-of-truth problems

If the source of truth is unclear, perform one cheap Codex inventory pass, summarize what is known, and stop.

## Escalation Test

Use Fable only if at least one is true:

- A wrong decision would likely cost more than the Fable call to unwind.
- Codex produced two plausible plans and the tradeoff is genuinely strategic.
- The issue combines product strategy, architecture, business model, and user trust.
- The NCSW methodology, package logic, scoring, or evidence standard is being stress-tested.
- A major launch, payments/accounts, membership/community, or native/web architecture choice is being made.

Most implementation tasks fail this test. Keep them in Codex.

## Packet First

Before any Fable call, write a compact packet in `/private/tmp/ncsw-fable-advisor/packet.md`. The packet must include:

```md
# Fable Advisor Packet

## Decision Needed
One sentence. What must be decided?

## Source Map
- App repo:
- Directus tables/collections:
- Relevant files:
- External docs or sources:

## Current Facts
Short bullets from Codex inspection. No speculation.

## Options
1. Option A
2. Option B
3. Option C, if real

## Constraints
- budget:
- timeline:
- platform:
- business:
- user trust:

## Risks To Evaluate
- risk 1
- risk 2

## Requested Output
Ask for a decision, reasoning, rejected alternatives, and the next bounded Codex task.
```

If the packet cannot be filled in, do not call Fable yet.

## Cost Guardrails

- Default call cap: `$3`.
- Hard normal cap: `$10`.
- Ask the user before any Fable call expected to exceed `$10`.
- Never call Fable without a `--max-budget-usd` cap.
- Never give Fable tools, filesystem access, browser access, or permission to run commands.
- Never ask Fable to continue autonomously.

## Invocation

Prefer the Claude CLI in noninteractive print mode when configured with the user's Anthropic API access.

Do not guess the model identifier. Use `$NCSW_FABLE_MODEL` if set. If it is not set, prepare the packet and ask the user for the exact Fable model name/alias to use.

```bash
claude -p \
  --model "$NCSW_FABLE_MODEL" \
  --max-budget-usd 3 \
  --tools "" \
  --permission-mode plan \
  < /private/tmp/ncsw-fable-advisor/packet.md
```

If `claude` does not support these flags in the current environment, do not improvise an unsafe equivalent. Report the missing flag and keep the packet for manual review.

## After Fable Responds

1. Treat Fable output as judgment, not authority.
2. Convert its recommendation into one bounded Codex task.
3. Keep implementation, inspection, and verification in Codex.
4. If Fable asks for more context, have Codex gather the specific missing evidence first.
5. Do not let a second Fable call happen until a new packet explains why the first answer was insufficient.

## Good Prompt Shape

```text
You are advising on one NCSW decision. Do not ask to inspect files or run tools.
Use only the facts in this packet.
Choose the best path, explain the tradeoff, identify what would change your mind,
and write the next bounded Codex task.
```
