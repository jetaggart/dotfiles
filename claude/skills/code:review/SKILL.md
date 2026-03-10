---
description: Review the current branch's changes against main. Deep analysis of logic, bugs, missed codepaths, and style. Read-only, no code changes.
user_invocable: true
---

# Code Review

<steps>
1. Gather context. Run all of these in parallel:
   - `git diff main...HEAD` to see all changes on this branch
   - `git log main..HEAD --oneline` to see the commit history
   - `git branch --show-current` to identify the branch
   - `git diff main...HEAD --stat` to see which files changed

2. Read every changed file in full. Do not just look at the diff. Understand the full file context each change lives in.

3. For every changed function, type, or module, use Grep and Glob to trace how it's used across the codebase. Look at callers, consumers, and related code. Build a complete picture of the blast radius.

4. Think deeply about what could go wrong. For each change, ask:
   - Are there codepaths that touch this code that we didn't modify but should have?
   - Are there callers or consumers that now receive different behavior unexpectedly?
   - Could this break under inputs or states that aren't obvious from the diff?
   - Are there race conditions, ordering issues, or state management problems?
   - Did we miss updating related code that depends on assumptions we just changed?

5. Produce a review with the following sections:

   <output_format>
   **what changed**
   brief summary of the branch: what it does, approach taken, commits involved.

   **bug risks**
   concrete potential bugs found through tracing the code. for each:
   - describe the scenario that could trigger it
   - reference the specific file, function, and line range
   - explain why it's a risk

   only include real risks grounded in code you read. do not speculate.

   **missed codepaths**
   places in the codebase that interact with the changed code but weren't updated. for each:
   - the file and function that could be affected
   - what assumption it makes that may now be wrong
   - what could go wrong if left as-is

   **style and consistency**
   patterns in the branch that diverge from the rest of the codebase. only flag things that meaningfully hurt readability or consistency, not nitpicks.

   **looks good**
   call out things the branch does well. solid patterns, good decisions, clean implementations.

   **verdict**
   one paragraph: overall assessment, biggest concerns, confidence level.
   </output_format>

6. Ground every observation in specific code references (file paths, line ranges, function names). Do not make vague claims.

7. This is read-only. Do not modify any files.
</steps>

<constraints>
- Read the actual codebase, not just the diff. Trace every change to its callers and consumers.
- Spend real effort looking for missed codepaths. This is the highest value part of the review.
- Prioritize correctness and logic bugs over style. Style section comes last for a reason.
- Be direct. If something looks wrong, say so with evidence.
- If the branch looks solid, say that. Do not invent issues to fill sections.
- Skip any section that has nothing meaningful to report.
</constraints>
