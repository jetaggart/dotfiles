#!/bin/bash
set -euo pipefail

DOTFILES="$HOME/code/dotfiles"

if [ ! -d "$HOME/.oh-my-zsh" ]; then
  RUNZSH=no CHSH=no KEEP_ZSHRC=yes \
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" \
    || true
fi

ln -sf "$DOTFILES/gitignore_global" "$HOME/.gitignore_global"
ln -sf "$DOTFILES/zsh/zshrc" "$HOME/.zshrc"
ln -sf "$DOTFILES/tmux/tmux.conf" "$HOME/.tmux.conf"

mkdir -p "$HOME/.config"
ln -sfn "$DOTFILES/nvim" "$HOME/.config/nvim"

mkdir -p "$HOME/.claude"
ln -sf "$DOTFILES/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -sf "$DOTFILES/claude/settings.json" "$HOME/.claude/settings.json"
ln -sfn "$DOTFILES/claude/skills" "$HOME/.claude/skills"

mkdir -p "$HOME/bin/tools"
cd "$DOTFILES/tools/tool"
bun install
cd /tmp
bun build "$DOTFILES/tools/tool/src/main.tsx" --compile --outfile "$HOME/bin/tools/tool"

echo "linux dotfiles installed"
