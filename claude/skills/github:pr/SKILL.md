---
name: github:pr
description: Fetch a GitHub PR for context, use as a style reference, template for implementation, or for reflection.
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

<steps>
1. Extract the owner, repo, and PR number from `$ARGUMENTS.url`. Run these in parallel:
   ```
   gh pr view <number> --repo <owner>/<repo>
   gh pr diff <number> --repo <owner>/<repo>
   gh pr view <number> --repo <owner>/<repo> --comments
   ```

2. Read through the diff. Pay attention to:
   - Structure and organization of changes
   - Patterns used (naming, error handling, abstractions)
   - How files relate to each other
   - Overall approach and architecture decisions

3. Respond based on `$ARGUMENTS.intent`:

   <intent_handlers>
   **reflect on style** - Describe the patterns, conventions, and style choices. Reference specific files and lines. Keep it concrete.

   **use as template** - Ask what the user wants to build. Implement it following the same patterns, structure, and conventions from the PR.

   **summarize** - Concise breakdown of what the PR does, why, and how. Focus on approach, not line-by-line changes.

   **no intent provided** - Ask the user what they'd like to do with this PR.

   **other** - Use the PR as context and follow the user's instructions.
   </intent_handlers>
</steps>
