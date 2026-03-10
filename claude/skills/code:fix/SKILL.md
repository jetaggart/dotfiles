---
description: Scan in-flight changes for lint, format, compile, and build errors. Fix everything it finds automatically.
user_invocable: true
---

# Code Fix

<steps>
1. Read the project's CLAUDE.md and CLAUDE.local.md if they exist. Look for:
   - lint, format, build, or compile commands
   - project-specific conventions or patterns
   - any referenced skills that might be relevant

2. Gather context. Run in parallel:
   - `git diff` and `git diff --cached` to see current changes
   - `git diff --name-only` and `git diff --cached --name-only` to get changed file list

3. Read each changed file in full to understand the context.

4. Discover the project's quality tools. Search these locations for scripts and commands:
   - CLAUDE.md, CLAUDE.local.md, CLAUDE.development.md
   - `package.json` scripts (lint, format, typecheck, build, check)
   - `Makefile` or `Justfile` targets (lint, format, check, build)
   - `bin/`, `scripts/`, `.bin/` directories for project-specific scripts
   - `pyproject.toml`, `setup.cfg`, `tox.ini` tool configs (ruff, mypy, black, flake8)
   - `Gemfile` for Ruby tools (rubocop, etc.)
   - `mix.exs` for Elixir tools (credo, dialyzer)
   - `Cargo.toml`, `go.mod`, `composer.json` for their respective ecosystems
   - Language-specific defaults: `cargo check`, `go vet`, `mix compile`, etc.

   Prefer project-defined scripts over raw tool invocations. If the project has a `bin/lint` or a `package.json` lint script, use that instead of calling the linter directly.

   Run the relevant tools scoped to changed files when possible. Run them in parallel when they're independent.

5. For each error or warning found:
   - Read the surrounding code to understand intent
   - Fix the issue directly, matching the style of the existing codebase
   - Do not refactor, improve, or change anything beyond what the tool flagged

6. After fixing, re-run the tools that found issues to confirm they pass.

7. Summarize what was fixed. List each fix with the file, line, and what changed.
</steps>

<constraints>
- Only fix issues surfaced by actual tools (linters, formatters, compilers). Do not go looking for other things to fix.
- Match the existing codebase style exactly. Do not impose new patterns.
- Do not add comments, docstrings, or type annotations unless a tool specifically flags their absence.
- If a tool isn't installed or a command fails, skip it and move on. Do not try to install tools.
- If an error is ambiguous or the fix isn't clear, flag it in the summary instead of guessing.
</constraints>
