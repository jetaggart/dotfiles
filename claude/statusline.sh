#!/bin/bash
input=$(cat)
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
DIR_DISPLAY="${DIR/#$HOME/~}"
if [ -n "${DEV_PROJECT:-}" ]; then
  printf '\033[36m[%s]\033[0m %s\n' "$DEV_PROJECT" "$DIR_DISPLAY"
else
  printf '%s\n' "$DIR_DISPLAY"
fi
