# Dotfiles

Personal dotfiles for macOS. All configs are symlinked from this repo into their expected locations.

## Installation

Run `./install.sh` from the repo root. It:
1. Symlinks config files to their system locations
2. Builds CLI tools via `bun install && bun run build` in `tools/`
3. Copies compiled tools to `~/bin/tools/` (on PATH)

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
- `gitignore_global` - global gitignore (`.me/`, `.claude/`, `.cursor/`, `.vscode/`)
</configs>

<claude_config>
- `claude/CLAUDE.md` - global Claude Code instructions for all projects
- `claude/settings.json` - Claude Code settings and pre-approved commands
- `claude/skills/` - global skills (commit, pr, me-claude, gh-lookup, simplify, python)
</claude_config>

## Tools (`tools/`)

Bun TypeScript projects compiled to standalone scripts in `~/bin/tools/`.

<tools>
- `pom` - pomodoro timer with terminal UI (React/Ink). Usage: `pom [minutes] [task]` or `pom -h [count]` for history. Saves sessions to `~/.pom/history.csv`.
- `ws` - workspace manager using git worktrees. Creates isolated workspaces with focused directory subsets. Generates `CLAUDE.local.md` with `<focus>` blocks. Symlinks the source's `CLAUDE.md` into the workspace if it exists.
  - `ws create <preset>` or `ws create <source> <target>` - create workspace
  - `ws add` - add repo to current workspace
  - `ws delete <dir>` - remove workspace and worktrees
  - Presets: `lettuce` (~/code/lettuce)
</tools>

To add a new tool: create `tools/scripts/<name>.ts`, add build script to `tools/package.json`, add the build step to the `build` script.

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
