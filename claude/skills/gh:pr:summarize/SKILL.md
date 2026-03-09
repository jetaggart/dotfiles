---
name: gh:pr:summarize
description: Summarize a GitHub PR with full context including diffs, comments, and review conversations.
user_invocable: true
args: <url>
---

<steps>
1. Extract the owner, repo, and PR number from the URL. Run all of these in parallel:
   ```
   gh pr view <number> --repo <owner>/<repo>
   gh pr diff <number> --repo <owner>/<repo>
   gh pr view <number> --repo <owner>/<repo> --comments
   gh api repos/<owner>/<repo>/pulls/<number>/reviews
   gh api repos/<owner>/<repo>/pulls/<number>/comments
   ```

2. Read through everything and produce a summary with these sections:

   <output_format>
   **<pr title>**
   One-paragraph overview of what this PR does and why.

   **Changes**
   Bulleted list of the meaningful changes, grouped by area. Reference specific files. Skip trivial changes like formatting.

   **Discussion**
   Summary of review comments and conversations. Highlight disagreements, requested changes, open questions, and decisions made. Skip resolved nitpicks unless they led to meaningful changes.

   **Status**
   Current state: merged/open/closed, approvals, outstanding review requests, unresolved threads.
   </output_format>

3. Keep it concise. Optimize for someone who needs to understand the PR in 30 seconds.
</steps>
