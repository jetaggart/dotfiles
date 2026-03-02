---
name: commit
description: Commit staged and unstaged changes with a concise, human commit message.
invoke: user
---

# Commit Skill

<steps>
1. Run `git diff`, `git diff --cached`, and `git status` in parallel to see all changes.

2. Draft a commit message:
   - One short lowercase title, no period, imperative mood
   - Brief and direct, sound like a human wrote it
   - No prefixes like "feat:" or "fix:" unless the repo already uses them
   - No AI attribution of any kind

3. Present the commit message to the user using AskUserQuestion. Include in the question text:
   - Repository name (from the directory name or git remote)
   - Current branch
   - List of changed files
   - The proposed commit message

   Options:
   - "Approve" - commit as-is
   - "Approve and push" - commit as-is, then push to remote
   - "Expand" - add a bullet-point body summarizing what changed and why, then present again
   - "Rewrite" - discuss what to change, draft a new message, then loop back to step 3

4. Once approved, stage relevant files with `git add` by name (not `git add -A`), then commit.

5. If "Approve and push" was chosen, run `git push`.

6. Show `git log --oneline -1` to confirm.
</steps>
