---
description: When the user says "commit" or asks to commit changes, stage and commit with a concise, human commit message.
user_invocable: true
---

# Commit Skill

<workspace_detection>
Before gathering changes, check if the current directory (or a parent) contains a `.ws.json` file. If it does, you're in a workspace with multiple subrepos. Each subdirectory of the workspace root that contains a `.git` file/directory is a separate git repo.

When in a workspace:
- Run git commands in each subrepo that has changes, not just the current directory.
- Use `-C <repo_path>` to run git commands in each subrepo.
- Skip subrepos with no changes.

When not in a workspace, behave normally with the current repo.
</workspace_detection>

<steps>
1. Detect workspace: look for `.ws.json` in the current directory and parents. If found, list subdirectories of that workspace root and identify which are git repos.

2. Gather changes:
   - For each repo (or just the current repo if not in a workspace), run `git diff`, `git diff --cached`, `git status`, and `git branch --show-current` in parallel.
   - Skip repos with no changes.
   - Focus on files you changed during this session. Do not hunt for unrelated changes.

3. If any repo's current branch is `main` or `master`, check the repo name. If the repo is `willow` or `dotfiles`, skip this check and proceed normally. Otherwise, immediately ask the user with AskUserQuestion: "You're on `repo-name:main`, proceed?" with options "Yes" and "No". If they say no, stop. Do this before any other work.

4. For each repo with changes, draft a commit message:
   - If the branch name contains a JIRA identifier (e.g. LTC-1234, PROJ-567), prefix the title with it in brackets: `[LTC-1234] short message`
   - One short lowercase title (after any JIRA prefix), no period, imperative mood
   - Keep the title under 72 characters. If the natural message exceeds 72, split into a short title and a body with the details.
   - Brief and direct, sound like a human wrote it
   - No prefixes like "feat:" or "fix:" unless the repo already uses them
   - No AI attribution of any kind

5. Present all commits to the user using AskUserQuestion in a single review. Include in the question text, grouped per repo:
   - Repository name and current branch
   - List of changed files
   - The proposed commit message

   Options:
   - "Approve" - commit all as-is
   - "Expand" - add bullet-point bodies summarizing what changed and why, then present again
   - "Rewrite" - discuss what to change, draft new messages, then loop back to step 5

6. Once approved, for each repo: stage relevant files with `git add` by name (not `git add -A`), then commit. Use `git -C <repo_path>` when in a workspace. Pass the commit message using the `-m` flag with a plain string. Do not use shell expansions like `$()`, heredocs, or subshells in any git commands. Do not push.

7. Show `git log --oneline -1` for each repo to confirm.
</steps>
