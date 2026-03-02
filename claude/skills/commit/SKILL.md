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

<steps>
1. Run `git diff`, `git diff --cached`, and `git status` in parallel to see all changes.

2. Draft a commit message:
   - One short lowercase title, no period, imperative mood
   - Brief and direct, sound like a human wrote it
   - No prefixes like "feat:" or "fix:" unless the repo already uses them
   - No AI attribution of any kind

3. If `$ARGUMENTS.flags` contains "wb":
   - Add a blank line after the title
   - Add a bullet-point summary of what changed and why
   - Keep bullets concise, one line each

4. Present the commit message to the user with these options:
   - **a** (approve) - commit as-is
   - **ap** (approve-push) - commit as-is, then push to remote
   - **e** (edit) - ask the user to provide the updated commit message, then commit with that
   - **rw** (rewrite) - discuss what to change, draft a new message, then loop back to step 4

5. Once approved, stage relevant files with `git add` by name (not `git add -A`), then commit.

6. If **ap** was chosen, run `git push`.

7. Show `git log --oneline -1` to confirm.
</steps>
