# Dotfiles

Personal dotfiles for macOS. All configs are symlinked from this repo into their expected locations.

## Installation

Run `./install.sh` from the repo root. It:
1. Symlinks config files to their system locations
2. Builds TypeScript CLI tools via `bun build --compile` in `tools/tool/`
3. Installs compiled binary (`tool`) to `~/bin/tools/` (on PATH)

Run it again after any changes to apply them.

<symlink_map>
| Source | Target |
|---|---|
| `zsh/zshrc` | `~/.zshrc` |
| `tmux/tmux.conf` | `~/.tmux.conf` |
| `nvim/` | `~/.config/nvim` |
| `ghostty/config` | `~/Library/Application Support/com.mitchellh.ghostty/config` |
| `lazygit/config.yml` | `~/Library/Application Support/lazygit/config.yml` |
| `psql/psqlrc` | `~/.psqlrc` |
| `pgcli/config` | `~/.config/pgcli/config` |
| `gitignore_global` | `~/.gitignore_global` |
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `claude/settings.json` | `~/.claude/settings.json` |
| `claude/skills/` | `~/.claude/skills` |
</symlink_map>

## File Deletion

Use `trash` instead of `rm`. The `trash()` function in zshrc moves files to `~/.Trash`.

## Structure

<configs>
- `zsh/zshrc` - shell config: env vars, aliases, vi mode, fzf, runtime loaders
- `tmux/tmux.conf` - tmux with Catppuccin Mocha theme, prefix `C-a`
- `tmux/scratch-popup.sh` - scratch session popup for tmux
- `nvim/init.lua` - neovim config based on kickstart.nvim, github_light theme
- `ghostty/config` - Ghostty terminal (JetBrainsMono, Alabaster theme)
- `lazygit/config.yml` - LazyGit with Catppuccin Latte theme, delta pager
- `psql/psqlrc` - psql with pspg pager and admin query shortcuts
- `pgcli/config` - pgcli with pspg pager, vi mode, Catppuccin Latte colors
- `gitignore_global` - global gitignore (`.me/`, `.claude/`, `.cursor/`, `.vscode/`)
</configs>

<claude_config>
- `claude/CLAUDE.md` - global Claude Code instructions for all projects
- `claude/settings.json` - Claude Code settings and pre-approved commands
- `claude/skills/` - global skills (git-commit, github-pr, github-lookup, me-claude, sub-agent, simplify, python, react, ws)
</claude_config>

## Tools (`tools/tool/`)

TypeScript CLI tools built with Ink and React. Compiled to a single native binary (`tool`) via `bun build --compile` → `~/bin/tools/tool`. Shell aliases (`pom`, `ws`, `q`) route to `tool <subcommand>`.

<tools>
- `pom` - pomodoro timer with terminal UI (Ink). Usage: `pom [minutes] [task]` or `pom -h [count]` for history. Saves sessions to `~/.pom/history.csv`.
- `q` (aliased with `noglob`) - quick question tool using Claude. Supports conversation continuation. Stores history in `~/.local/share/q/`.
  - `q <question>` or `q n <question>` - new question (opus)
  - `q c <question>` - continue previous conversation (opus)
  - `q q <question>` - quick one-shot (sonnet)
  - `q d` - delete current conversation
- `ws` - workspace manager using git worktrees. Creates isolated workspaces with focused directory subsets. Generates `CLAUDE.local.md` with `<focus>` blocks. Symlinks the source's `CLAUDE.md` into the workspace if it exists.
  - `ws create [--tmux]` - scans cwd for repos, creates workspace under cwd/workspaces
  - `ws add` - add repos to current workspace (same pick → check → focus flow as create)
  - `ws remove` - remove one repo from current workspace
  - `ws color` - pick a random title bar theme in the current workspace `.code-workspace`
  - `ws delete <dir>` - remove workspace and worktrees
</tools>

Shared code in `tools/tool/src/lib/`: `git.ts` (exec helpers), `styles.ts` (chalk color constants).

To add a new tool: create `tools/tool/src/<name>/main.ts`, add case to `tools/tool/src/main.ts` switch.

## `dev` (containerized projects)

Project isolation via Docker on OrbStack. Each project lives in a named volume, runs in its own container, source code never sits on the host.

<dev_architecture>
- host: dotfiles + `tool` binary only. no project source.
- per-project container `dev-<name>` running the `dev-base:latest` image.
- per-project named volumes: `<name>-src` (source), `<name>-cache` (npm/bun caches).
- shared `dev-creds` volume holds claude OAuth, ssh key, gitconfig. mounted read-only into project containers.
- per-project compose file at `~/.config/dev/projects/<name>/compose.yaml`.
- localhost networking: orbstack auto-publishes any container port to host `localhost:<port>`.
- editor: vscode/cursor remote-containers attach to the running container; nvim works via `dev shell`.
</dev_architecture>

<dev_setup>
One-time setup: `dev init`
- builds `dev-base:latest` (ubuntu, node, bun, claude, dotfiles) if missing
- drops you in a shell with the shared creds volume mounted, where you should run:
  - `claude /login` (claude oauth)
  - `ssh-keygen -t ed25519 -f ~/.dev-creds/ssh/id_ed25519 -N ''`
  - `printf '[user]\n  name = Your Name\n  email = you@example.com\n' > ~/.dev-creds/gitconfig`
  - exit when done
- add `~/.dev-creds/ssh/id_ed25519.pub` (from inside the shell) to your github account
</dev_setup>

<dev_commands>
| command | purpose |
|---|---|
| `dev` | list projects + status (no args) |
| `dev create <name> [git-url]` | new project: volumes + container + optional clone |
| `dev start/stop <name>` | container lifecycle |
| `dev shell <name>` | interactive zsh inside container |
| `dev exec <name> -- <cmd>` | one-off command inside |
| `dev claude <name>` | run claude inside container |
| `dev code <name>` / `dev cursor <name>` | open in editor (remote-containers attached) |
| `dev nuke <name> --yes` | full wipe: container + source + cache volumes |
| `dev rebuild <name>` | recreate container, keep volumes (regenerates compose.yaml) |
| `dev backup/restore <name> <file>` | snapshot/restore source volume |
| `dev init` | first-time bootstrap (build-image + auth) |
| `dev auth` | refresh creds volume |
| `dev build-image` | rebuild dev-base |
| `dev doctor` | health check |
| `dev config [get/set]` | global config (baseImage, credsVolume) |

Subcommands accept `$DEV_PROJECT` as a fallback when `<name>` is omitted, so you can `export DEV_PROJECT=lettuce` and just run `dev shell` etc.
</dev_commands>

<dev_daily_flow>
```
dev start lettuce          # if stopped
dev code lettuce           # vscode opens, attached to container
dev shell lettuce          # second terminal inside container
# inside the container:
ws create my-feature            # worktrees inside the volume
cd workspaces/my-feature
claude
# host browser: http://localhost:3000 hits a dev server in the container
```
</dev_daily_flow>

<dev_security_model>
- malicious npm package can't read host secrets (~/.ssh, ~/.aws, browser profiles, wallets) — none are mounted into containers.
- shared creds volume holds claude OAuth + a github ssh key dedicated to dev work. mounted read-only into project containers; revoke and re-auth if compromised.
- network egress is unrestricted — design choice for simplicity. read protections cut off most stealer-style threats at the source.
</dev_security_model>

## Zsh Highlights

<zsh>
- Vi mode with `[I]`/`[N]` prompt indicator
- `$c` = `~/code` shortcut
- `me` function runs scripts from the nearest `.me/` directory (with tab completion)
- `trash()` moves to `~/.Trash` instead of deleting
- `jfx()` pipes command output through `fx` JSON explorer
- Aliases: `vi`/`vim` → nvim, `lg` → lazygit, `br` → bun run, `ai` → aichat
- Extensive git aliases matching Oh My Zsh conventions
</zsh>

## Tmux Key Bindings

Prefix is `C-a`.

<tmux_keys>
**No prefix:** `M-h/j/k/l` pane nav, `M-1`–`M-5` window select, `M-n/M-p` next/prev window, `M-z` zoom, `M-f` scratch popup

**With prefix:** `|` vsplit, `-` hsplit, `c` new window, `g` 2x2 grid, `G` 3-col layout, `h/j/k/l` pane nav, `H/J/K/L` resize, `m` zoom, `x` kill pane, `X` kill window, `<`/`>` swap pane, `S` sync panes, `r` reload, `P` toggle logging
</tmux_keys>
