---
description: When a github.com URL appears in the conversation (PR, issue, commit, repo), use the gh CLI to fetch its details instead of WebFetch.
user_invocable: true
args: <url>
---

<steps>
1. Parse the URL to determine the resource type (PR, issue, commit, repo).

2. Use the appropriate gh command:
   - PR: `gh pr view <number> --repo <owner/repo>`
   - Issue: `gh issue view <number> --repo <owner/repo>`
   - Commit: `gh api repos/<owner/repo>/commits/<sha>`
   - Repo: `gh repo view <owner/repo>`

3. Return the result to the user.
</steps>
