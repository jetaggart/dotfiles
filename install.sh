#!/bin/bash

DOTFILES="$HOME/code/dotfiles"

ln -sf "$DOTFILES/gitignore_global" "$HOME/.gitignore_global"
ln -sf "$DOTFILES/zsh/zshrc" "$HOME/.zshrc"
ln -sf "$DOTFILES/tmux/tmux.conf" "$HOME/.tmux.conf"
ln -sf "$DOTFILES/psql/psqlrc" "$HOME/.psqlrc"

mkdir -p "$HOME/.config/pgcli"
ln -sf "$DOTFILES/pgcli/config" "$HOME/.config/pgcli/config"

mkdir -p "$HOME/.config"
ln -sfn "$DOTFILES/nvim" "$HOME/.config/nvim"

mkdir -p "$HOME/Library/Application Support/lazygit"
ln -sf "$DOTFILES/lazygit/config.yml" "$HOME/Library/Application Support/lazygit/config.yml"

mkdir -p "$HOME/Library/Application Support/com.mitchellh.ghostty"
ln -sf "$DOTFILES/ghostty/config" "$HOME/Library/Application Support/com.mitchellh.ghostty/config"

mkdir -p "$HOME/.claude"
ln -sf "$DOTFILES/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -sf "$DOTFILES/claude/settings.json" "$HOME/.claude/settings.json"
ln -sfn "$DOTFILES/claude/skills" "$HOME/.claude/skills"

mkdir -p "$HOME/Library/Application Support/Cursor/User"
ln -sf "$DOTFILES/cursor/settings.json" "$HOME/Library/Application Support/Cursor/User/settings.json"
ln -sf "$DOTFILES/cursor/keybindings.json" "$HOME/Library/Application Support/Cursor/User/keybindings.json"

rm -rf "$HOME/bin/tools"
mkdir -p "$HOME/bin/tools"

cd "$DOTFILES/tools/tool"
bun install
cd /tmp
bun build "$DOTFILES/tools/tool/src/main.tsx" --compile --outfile "$HOME/bin/tools/tool"

echo "dotfiles installed"
