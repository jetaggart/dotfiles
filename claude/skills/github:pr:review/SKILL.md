---
name: github:pr:review
description: Deep analysis and review of a GitHub PR. Examines logic, codebase fit, gaps, risks, and testing needs. Read-only, no code changes.
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

2. Read the full diff carefully. For every file changed, read the surrounding code in the repo to understand the context the diff lives in. Use Grep and Glob to trace how changed functions, types, and modules are used elsewhere. Build a mental model of the affected area before evaluating.

3. Produce a review with the following sections:

   <output_format>
   **Overview**
   One paragraph: what this PR does, the approach taken, and the motivation.

   **Logic Review**
   Walk through the core logic changes. For each significant change:
   - Describe what it does
   - Evaluate correctness: edge cases, off-by-ones, null/empty handling, race conditions
   - Flag any assumptions that could break under different inputs or states

   **Codebase Fit**
   - Does this follow existing patterns and conventions in the repo?
   - Are there existing utilities, helpers, or abstractions that should have been used instead of new code?
   - Does the change sit at the right layer of the architecture?
   - Any naming inconsistencies with the surrounding code?

   **Gaps and Risks**
   - Missing error handling or edge cases
   - State management issues (stale data, missing cleanup, leaked resources)
   - Security considerations (injection, auth, data exposure)
   - Performance implications (N+1 queries, unnecessary computation, memory growth)
   - Concurrency issues if applicable
   - Backwards compatibility or migration concerns

   **Testing**
   - What test cases would give confidence in this change?
   - Which edge cases and failure modes should be covered?
   - Are there integration boundaries that need testing?
   - Suggest specific test scenarios, grouped by priority

   **Verdict**
   One paragraph summary: overall quality, biggest concerns, and whether this looks ready to merge.
   </output_format>

4. Ground every observation in specific code references (file paths, line ranges, function names). Do not make vague claims.

5. This is a read-only analysis. Do not modify any files.
</steps>

<constraints>
- Read the actual codebase, not just the diff. Context matters.
- Prioritize correctness and logic issues over style nitpicks.
- Be direct about problems. If something looks wrong, say so clearly.
- If the PR looks solid, say that too. Don't invent issues.
- Keep the review useful for the author. Actionable observations over abstract commentary.
</constraints>
