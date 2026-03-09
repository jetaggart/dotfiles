---
description: When the user says "commit" or asks to commit changes, stage and commit with a concise, human commit message.
user_invocable: true
---

# Commit Skill

<steps>
1. Gather the state of changes you worked on:
   - Run `git diff`, `git diff --cached`, `git status`, and `git branch --show-current` in parallel.
   - Focus on files you changed during this session. Do not hunt for other repos or unrelated changes.

2. If the current branch is `main` or `master`, immediately ask the user with AskUserQuestion: "You're on main, proceed?" with options "Yes" and "No". If they say no, stop. Do this before any other work.

3. For each repo, draft a commit message:
   - If the branch name contains a JIRA identifier (e.g. LTC-1234, PROJ-567), prefix the title with it in brackets: `[LTC-1234] short message`
   - One short lowercase title (after any JIRA prefix), no period, imperative mood
   - Keep the title under 72 characters. If the natural message exceeds 72, split into a short title and a body with the details.
   - Brief and direct, sound like a human wrote it
   - No prefixes like "feat:" or "fix:" unless the repo already uses them
   - No AI attribution of any kind

4. Present all commits to the user using AskUserQuestion in a single review. Include in the question text, grouped per repo:
   - Repository name and current branch
   - List of changed files
   - The proposed commit message

   Options:
   - "Approve" - commit all as-is
   - "Approve and push" - commit all, then push each to remote
   - "Expand" - add bullet-point bodies summarizing what changed and why, then present again
   - "Rewrite" - discuss what to change, draft new messages, then loop back to step 4

5. Once approved, for each repo: stage relevant files with `git add` by name (not `git add -A`), then commit.

6. If "Approve and push" was chosen, run `git push` for each repo.

7. Show `git log --oneline -1` for each repo to confirm.
</steps>
