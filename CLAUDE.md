# Dotfiles

Personal dotfiles for macOS. All configs are symlinked from this repo into their expected locations.

## Installation

Run `./install.sh` from the repo root. It:
1. Symlinks config files to their system locations
2. Builds Go CLI tools via `make` in `tools/go/`
3. Installs compiled binaries to `~/bin/tools/` (on PATH)

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
- `claude/skills/` - global skills (git:commit, github:pr, github:lookup, me:claude, sub:agent, simplify, python, react, ws)
</claude_config>

## Tools (`tools/go/`)

Go CLI tools built with Bubble Tea and Lip Gloss. Compiled to `~/bin/tools/` via `make`.

<tools>
- `pom` - pomodoro timer with terminal UI (Bubble Tea). Usage: `pom [minutes] [task]` or `pom -h [count]` for history. Saves sessions to `~/.pom/history.csv`.
- `query` (aliased as `q` with `noglob`) - quick question tool using Claude. Supports conversation continuation. Stores history in `~/.local/share/q/`.
  - `q <question>` or `q n <question>` - new question (opus)
  - `q c <question>` - continue previous conversation (opus)
  - `q q <question>` - quick one-shot (sonnet)
  - `q d` - delete current conversation
- `ws` - workspace manager using git worktrees. Creates isolated workspaces with focused directory subsets. Generates `CLAUDE.local.md` with `<focus>` blocks. Symlinks the source's `CLAUDE.md` into the workspace if it exists.
  - `ws create <preset>` or `ws create <source> <target>` - create workspace
  - `ws add` - add repo to current workspace
  - `ws delete <dir>` - remove workspace and worktrees
  - Presets: `lettuce` (~/code/lettuce)
</tools>

Shared code in `tools/go/internal/`: `git/` (exec helpers), `ui/` (Lip Gloss style constants).

To add a new tool: create `tools/go/cmd/<name>/main.go`, add target to `tools/go/Makefile`.

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
