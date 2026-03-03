---
description: When the user says "commit" or asks to commit changes, stage and commit with a concise, human commit message.
user_invocable: true
---

# Commit Skill

<steps>
1. Detect repos involved in the current changes:
   - The working directory may not be a git repo itself. It may be a plain directory containing multiple subdirectories that are each independent git repos.
   - Check if the current directory is a git repo. If not, scan immediate subdirectories for `.git` directories.
   - For each repo with changes, run `git diff`, `git diff --cached`, `git status`, and `git branch --show-current` in parallel.

2. For each repo, draft a commit message:
   - If the branch name contains a JIRA identifier (e.g. LTC-1234, PROJ-567), prefix the title with it in brackets: `[LTC-1234] short message`
   - One short lowercase title (after any JIRA prefix), no period, imperative mood
   - Brief and direct, sound like a human wrote it
   - No prefixes like "feat:" or "fix:" unless the repo already uses them
   - No AI attribution of any kind

3. Present all commits to the user using AskUserQuestion in a single review. Include in the question text, grouped per repo:
   - Repository name and current branch
   - List of changed files
   - The proposed commit message

   Options:
   - "Approve" - commit all as-is
   - "Approve and push" - commit all, then push each to remote
   - "Expand" - add bullet-point bodies summarizing what changed and why, then present again
   - "Rewrite" - discuss what to change, draft new messages, then loop back to step 3

4. Once approved, for each repo: stage relevant files with `git add` by name (not `git add -A`), then commit.

5. If "Approve and push" was chosen, run `git push` for each repo.

6. Show `git log --oneline -1` for each repo to confirm.
</steps>
