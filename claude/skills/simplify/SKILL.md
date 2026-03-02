---
name: simplify
description: Review changed code for reuse, quality, and efficiency, then fix any issues found.
invoke: user
arguments:
  - name: scope
    description: "Optional scope: file path, function name, or 'staged' for git staged changes"
    required: false
---

# Simplify Skill

<steps>
1. Determine what to review:
   - If `$ARGUMENTS.scope` is "staged" or empty, run `git diff --cached` and `git diff` to find changed code
   - If a file path or function name is given, read that specific code

2. Analyze the code for:
   <review_criteria>
   - **Duplication** - repeated logic that could share a single implementation
   - **Unnecessary complexity** - overly nested conditions, redundant checks, convoluted flow
   - **Dead code** - unused variables, unreachable branches, leftover debugging
   - **Inefficiency** - obvious performance issues like N+1 patterns, unnecessary allocations, repeated computation
   - **Clarity** - confusing names, unclear intent, code that requires mental gymnastics to follow
   </review_criteria>

3. For each issue found, fix it directly. Keep changes minimal and focused.

4. Present a short summary of what was changed and why.
</steps>

<constraints>
- Do not refactor code that wasn't in scope
- Do not add abstractions unless they eliminate real duplication
- Do not change behavior, only structure and clarity
- Match the existing style of the codebase
</constraints>
