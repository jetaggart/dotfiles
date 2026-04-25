#!/bin/bash
set -euo pipefail

CREDS="${DEV_CREDS_DIR:-/root/.dev-creds}"
FROM_SCRATCH="${FROM_SCRATCH:-0}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }

if [ "$FROM_SCRATCH" = "1" ]; then
  bold "starting from scratch (deleting existing credentials)"
  rm -f "$CREDS/ssh/id_ed25519" "$CREDS/ssh/id_ed25519.pub"
  rm -f "$CREDS/gitconfig"
  rm -f "$CREDS/claude/.credentials.json"
  echo
fi

mkdir -p "$CREDS/claude" "$CREDS/ssh"

mkdir -p /root/.claude
ln -sf "$CREDS/claude/.credentials.json" /root/.claude/.credentials.json

if [ ! -f "$CREDS/ssh/id_ed25519" ]; then
  bold "generating ssh key (used for both git auth and commit signing)"
  read -r -p "  ssh key comment (your email is fine): " SSH_COMMENT
  ssh-keygen -t ed25519 -f "$CREDS/ssh/id_ed25519" -N "" -C "$SSH_COMMENT"
  echo
else
  dim "ssh key already exists at $CREDS/ssh/id_ed25519, reusing"
  echo
fi

if [ ! -f "$CREDS/gitconfig" ]; then
  bold "writing gitconfig with ssh-based commit signing"
  read -r -p "  git user.name: " GIT_NAME
  read -r -p "  git user.email: " GIT_EMAIL
  cat > "$CREDS/gitconfig" <<EOF
[user]
  name = $GIT_NAME
  email = $GIT_EMAIL
  signingkey = $CREDS/ssh/id_ed25519.pub

[gpg]
  format = ssh

[commit]
  gpgsign = true

[tag]
  gpgsign = true

[init]
  defaultBranch = main
EOF
  echo
else
  dim "gitconfig already exists at $CREDS/gitconfig, reusing"
  echo
fi

bold "ssh public key (add to github → settings → ssh and gpg keys):"
dim "  add it twice — once as 'Authentication Key', once as 'Signing Key'"
echo
cat "$CREDS/ssh/id_ed25519.pub"
echo
bold "next:"
dim "  1. add the key above to https://github.com/settings/keys (twice)"
dim "  2. run 'claude /login' to authenticate claude code"
dim "  3. exit when done"
echo

exec zsh -l
