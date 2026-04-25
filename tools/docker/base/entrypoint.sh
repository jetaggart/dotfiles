#!/bin/bash
set -e

CREDS="${DEV_CREDS_DIR:-/root/.dev-creds}"

if [ -d "$CREDS" ]; then
  if [ -f "$CREDS/claude/.credentials.json" ]; then
    mkdir -p /root/.claude
    ln -sf "$CREDS/claude/.credentials.json" /root/.claude/.credentials.json
  fi

  if [ -d "$CREDS/ssh" ]; then
    mkdir -p /root/.ssh
    chmod 700 /root/.ssh
    cp -a "$CREDS/ssh/." /root/.ssh/
    chmod 600 /root/.ssh/* 2>/dev/null || true
    chmod 644 /root/.ssh/*.pub 2>/dev/null || true
  fi

  if [ -f "$CREDS/gitconfig" ]; then
    ln -sf "$CREDS/gitconfig" /root/.gitconfig
  fi

  mkdir -p "$CREDS/ngrok" /root/.config
  ln -sfn "$CREDS/ngrok" /root/.config/ngrok
fi

if [ -d /root/.ssh/host_authorized_keys.d ]; then
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  cat /root/.ssh/host_authorized_keys.d/*.pub > /root/.ssh/authorized_keys 2>/dev/null || true
  chmod 600 /root/.ssh/authorized_keys
fi

{
  echo "Port ${SSH_PORT:-22}"
  [ -n "${DEV_PROJECT:-}" ] && echo "SetEnv DEV_PROJECT=${DEV_PROJECT}"
} > /etc/ssh/sshd_config.d/99-runtime.conf

exec /usr/sbin/sshd -D -e
