#!/bin/bash
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.yaml|*.yml|*.css|*.scss|*.html|*.md|*.mdx) ;;
  *) exit 0 ;;
esac

find_workspace_root() {
  local dir="$1"
  while [ "$dir" != "/" ] && [ -n "$dir" ]; do
    if [ -f "$dir/pnpm-lock.yaml" ] \
       || [ -f "$dir/yarn.lock" ] \
       || [ -f "$dir/bun.lock" ] \
       || [ -f "$dir/bun.lockb" ] \
       || [ -f "$dir/package-lock.json" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

detect_pm() {
  local dir="$1"
  if [ -f "$dir/pnpm-lock.yaml" ]; then echo "pnpm"
  elif [ -f "$dir/yarn.lock" ]; then echo "yarn"
  elif [ -f "$dir/bun.lock" ] || [ -f "$dir/bun.lockb" ]; then echo "bun"
  elif [ -f "$dir/package-lock.json" ]; then echo "npm"
  fi
}

root=$(find_workspace_root "$(dirname "$file")") || exit 0
pm=$(detect_pm "$root")
[ -n "$pm" ] || exit 0

(cd "$root" && "$pm" exec prettier --write --log-level=silent "$file" 2>/dev/null) || true
exit 0
