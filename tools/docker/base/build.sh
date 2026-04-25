#!/bin/bash
set -euo pipefail

DOTFILES="${DOTFILES:-$HOME/code/dotfiles}"
IMAGE="${DEV_BASE_IMAGE:-dev-base:latest}"

cd "$DOTFILES"

docker build \
  --tag "$IMAGE" \
  --file tools/docker/base/Dockerfile \
  --build-arg "CACHE_BUST=$(date +%s)" \
  .

echo "built $IMAGE"
