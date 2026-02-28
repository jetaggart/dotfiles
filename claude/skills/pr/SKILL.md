---
name: pr
description: Fetch a GitHub PR for context — use as a style reference, template for implementation, or for reflection.
invoke: user
arguments:
  - name: url
    description: GitHub PR URL (e.g. https://github.com/org/repo/pull/123)
    required: true
  - name: intent
    description: What to do with the PR (e.g. "reflect on style", "use as template", "summarize approach")
    required: false
---

# PR Context Skill

You have been given a GitHub PR to use as context. Follow these steps:

## 1. Fetch the PR

Extract the owner, repo, and PR number from the URL argument: `$ARGUMENTS.url`

Run these commands to gather full context:

```
gh pr view <number> --repo <owner>/<repo>
gh pr diff <number> --repo <owner>/<repo>
gh pr view <number> --repo <owner>/<repo> --comments
```

## 2. Understand the PR

Read through the diff carefully. Pay attention to:
- The structure and organization of changes
- Patterns used (naming, error handling, abstractions)
- How files relate to each other
- The overall approach and architecture decisions

## 3. Respond to intent

The user's intent is: `$ARGUMENTS.intent`

If no intent was provided, ask the user what they'd like to do with this PR.

**If reflecting on style:** Describe the patterns, conventions, and style choices. Note what's done well and what stands out. Keep it concrete — reference specific files and lines.

**If using as a template:** Ask the user what they want to build. Then implement it following the same patterns, structure, and conventions from the PR. Match the style exactly.

**If summarizing:** Give a concise breakdown of what the PR does, why, and how. Focus on the approach, not line-by-line changes.

**For any other intent:** Use the PR as context and follow the user's instructions.
