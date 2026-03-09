---
name: sub:agent
description: Launch a sub-agent to work on a task in the background or foreground
user_invocable: true
args: <task description>
---

<steps>
1. Take the task description from the arguments.

2. Determine the right agent type based on the task:
   - Code search, file exploration, codebase questions → `Explore`
   - Implementation planning, architecture decisions → `Plan`
   - Everything else (research, multi-step tasks, code changes) → `general-purpose`

3. Launch the agent using the Agent tool:
   - Use `run_in_background: true` so you can continue working
   - Write a clear, detailed prompt that includes all necessary context from the current conversation
   - Use `isolation: "worktree"` if the task involves code changes, so it works on an isolated copy

4. Tell the user the agent is running and what it's doing.
</steps>
