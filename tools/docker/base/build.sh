#!/bin/bash
set -euo pipefail

DOTFILES="${DOTFILES:-$HOME/code/dotfiles}"
IMAGE="${DEV_BASE_IMAGE:-dev-base:latest}"
DOTFILES_REPO="${DOTFILES_REPO:-https://github.com/jetaggart/dotfiles}"

cd "$DOTFILES/tools/docker/base"

docker build \
  --tag "$IMAGE" \
  --build-arg "DOTFILES_REPO=$DOTFILES_REPO" \
  .

echo "built $IMAGE"
