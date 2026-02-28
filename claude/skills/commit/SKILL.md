---
name: commit
description: Commit staged and unstaged changes with a concise, human commit message.
invoke: user
arguments:
  - name: flags
    description: "Optional flags: 'wb' to include a bullet-point summary body"
    required: false
---

# Commit Skill

## Steps

1. Run `git diff` and `git diff --cached` and `git status` to see all changes.

2. Draft a commit message:
   - One short lowercase title, no period, imperative mood
   - Sound like a human, not AI — brief and direct
   - No prefixes like "feat:" or "fix:" unless the repo already uses them
   - Do NOT include "Co-Authored-By" or any AI attribution

3. If `$ARGUMENTS.flags` contains "wb":
   - Add a blank line after the title
   - Add a bullet-point summary of what changed and why
   - Keep bullets concise — one line each

4. Present the commit message to the user with these options:
   - **a** (approve) - commit as-is
   - **e** (edit) - ask the user to provide the updated commit message, then commit with that
   - **rw** (rewrite) - have an interactive conversation about what to change, draft a new message based on feedback, then loop back to step 4

5. Once approved, stage all changes with `git add` for the relevant files (not `git add -A`), then commit.

6. Show `git log --oneline -1` to confirm.
