#!/bin/bash
set -e

CREDS="${DEV_CREDS_DIR:-/home/dev/.dev-creds}"

if [ -d "$CREDS" ]; then
  if [ -f "$CREDS/claude/.credentials.json" ]; then
    mkdir -p /home/dev/.claude
    ln -sf "$CREDS/claude/.credentials.json" /home/dev/.claude/.credentials.json
  fi

  if [ -d "$CREDS/ssh" ]; then
    rm -rf /home/dev/.ssh
    cp -a "$CREDS/ssh" /home/dev/.ssh
    chmod 700 /home/dev/.ssh
    chmod 600 /home/dev/.ssh/* 2>/dev/null || true
  fi

  if [ -f "$CREDS/gitconfig" ]; then
    ln -sf "$CREDS/gitconfig" /home/dev/.gitconfig
  fi
fi

exec "$@"
