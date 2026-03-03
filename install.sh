#!/bin/bash

DOTFILES="$HOME/code/dotfiles"

ln -sf "$DOTFILES/gitignore_global" "$HOME/.gitignore_global"
ln -sf "$DOTFILES/zsh/zshrc" "$HOME/.zshrc"
ln -sf "$DOTFILES/tmux/tmux.conf" "$HOME/.tmux.conf"
ln -sf "$DOTFILES/psql/psqlrc" "$HOME/.psqlrc"

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

rm -rf "$HOME/bin/tools"

cd "$DOTFILES/tools" && bun install && bun run install-cli

echo "dotfiles installed"
