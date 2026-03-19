---
name: claude-install
description: Analyze a codebase and generate all Claude Code configuration files. Use when setting up Claude Code for a new project, bootstrapping CLAUDE.md and related config, or when the user says "orchestrate", "set up claude code", "bootstrap claude config", or "generate claude files".
disable-model-invocation: true
allowed-tools: Read, Bash, Write, Edit, Glob, Grep, LS
---

<goal>
ultrathink. generate a complete Claude Code configuration for this project. analyze the codebase first, then create all relevant files.
</goal>

<phase_1_analyze>
gather context before writing anything. run these in order:

1. read the project root for config files:
   - package.json, Cargo.toml, pyproject.toml, go.mod, Gemfile, build.gradle, pom.xml, Makefile, docker-compose.yml, .env.example
   - tsconfig.json, .eslintrc*, .prettierrc*, biome.json, .editorconfig
   - existing CLAUDE.md, .claude/, .cursorrules, AGENTS.md

2. map the directory structure (top 3 levels, skip node_modules, .git, dist, build, __pycache__, .next, target, vendor):
   ```bash
   find . -maxdepth 3 -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/__pycache__/*' -not -path '*/.next/*' -not -path '*/target/*' -not -path '*/vendor/*' | head -200
   ```

3. identify:
   - language and framework
   - package manager (npm, pnpm, yarn, pip, cargo, go, etc.)
   - test framework and test command
   - build command
   - lint/format tools and commands
   - database / ORM if present
   - CI/CD config (.github/workflows, .gitlab-ci.yml, etc.)
   - monorepo structure (workspaces, packages/, apps/)
   - any existing scripts in package.json or Makefile

4. check for existing Claude config:
   ```bash
   ls -la CLAUDE.md .claude/ .mcp.json 2>/dev/null
   ```
   if files exist, read them and improve rather than overwrite.
</phase_1_analyze>

<phase_2_generate>
create each file based on what you found. skip files that aren't relevant to this project.

<claude_md>
always create. rules:
- under 150 lines
- no obvious info Claude can infer (like "this is a TypeScript project" when tsconfig exists)
- include: project one-liner, commands (dev/test/lint/build), folder map, gotchas/warnings
- do NOT include code style rules if a linter config exists
- do NOT include dependency lists
- note that .claude/settings.local.json exists for personal overrides and is gitignored
</claude_md>

<settings_json>
always create `.claude/settings.json`. include:
- permission allowlist for detected build/test/lint commands
- deny rules for .env, .env.*, secrets/

populate `allow` with the actual commands found in the project (e.g., `Bash(pnpm run test *)`, `Bash(pnpm run lint)`, `Bash(pnpm run build)`).

<example>
{
  "permissions": {
    "allow": [],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}
</example>
</settings_json>

<settings_local>
create `.claude/settings.local.json` as a template:

<example>
{
  "permissions": {
    "allow": []
  }
}
</example>
</settings_local>

<hooks>
add to `.claude/settings.json` if a linter/formatter is detected (prettier, eslint, biome, ruff, rustfmt, gofmt, or similar).

use the actual format command from the project:
- prettier: `npx prettier --write "$CLAUDE_FILE_PATH"`
- biome: `npx biome check --write "$CLAUDE_FILE_PATH"`
- ruff: `ruff format "$CLAUDE_FILE_PATH"`
- rustfmt: `rustfmt "$CLAUDE_FILE_PATH"`
- gofmt: `gofmt -w "$CLAUDE_FILE_PATH"`

always add a Notification hook for macos.

<example>
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "<detected format command>"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
</example>
</hooks>

<monorepo>
if the project has distinct packages (packages/, apps/, services/, libs/, or workspace config):
- create a CLAUDE.md in each major package/app directory (under 50 lines each)
- include only what's specific to that package: its purpose, unique commands, special rules, key files
- create relevant skills in each package's `.claude/skills/` if the package has its own build/test/deploy commands
- each package's CLAUDE.md should be self-contained enough that Claude can work in that directory without reading the root CLAUDE.md
</monorepo>

<skills>
create 1-2 relevant skills in `.claude/skills/`.

always create a commit skill. replace placeholder commands with actual detected commands.

<example>
`.claude/skills/commit/SKILL.md`:
---
name: commit
description: Commit changes with conventional commits
disable-model-invocation: true
---

1. run the project's lint command
2. run the project's test command (relevant tests only if possible)
3. stage changed files with `git add`
4. write a conventional commit message (type: description)
5. commit
</example>

if a deployment method is detected (vercel.json, netlify.toml, fly.toml, Dockerfile, k8s configs), create a deploy skill with steps based on the detected method.
</skills>

<agents>
if the project has more than ~50 source files, create `.claude/agents/code-reviewer.md`:

<example>
---
name: code-reviewer
description: Reviews code changes for quality, bugs, and security
memory: user
---

you are a code reviewer for this project. review the diff or specified files for:
1. bugs and logic errors
2. security issues
3. missing error handling
4. test coverage gaps
5. consistency with existing patterns

be specific. cite line numbers. suggest fixes.
</example>
</agents>

<gitignore>
ensure `.claude/settings.local.json` is in .gitignore. check before adding.
</gitignore>
</phase_2_generate>

<phase_3_verify>
after creating all files:

1. list everything created:
   ```bash
   find .claude -type f 2>/dev/null && ls -la CLAUDE.md .mcp.json 2>/dev/null
   ```

2. validate settings JSON:
   ```bash
   python3 -c "import json; json.load(open('.claude/settings.json'))" 2>&1
   ```

3. print a summary of what was created and why, organized by file.
</phase_3_verify>

<rules>
- if CLAUDE.md or other claude config files already exist, read them first. rewrite or improve them to match the style and structure defined in this skill (XML tags, concise, actionable). do not preserve poor structure out of politeness.
- all commands in settings and skills must be actual commands that work in this project, not generic placeholders.
- test that detected commands actually exist before adding them to config.
- keep everything minimal. less config = better adherence.
</rules>
