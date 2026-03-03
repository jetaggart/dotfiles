---
description: Set up a .me/ directory in the current project to version CLAUDE.local.md and project skills in a personal git repo, symlinked back into place.
user_invocable: true
---

<purpose>
Create a `.me/` directory in the project root that acts as a personal git repo for versioning `CLAUDE.local.md` and `.claude/skills/`. The `.me/` directory is globally gitignored so it never leaks into the project repo. An `install.sh` script symlinks everything back to where Claude Code expects it.
</purpose>

<prerequisites>
The global `~/.gitignore` must contain `.me/` and `Claude.local.md` entries. Verify before proceeding, warn the user if missing.
</prerequisites>

<structure>
```
.me/                        # personal git repo, globally ignored
├── .gitignore              # negates global ignore for CLAUDE.local.md
├── CLAUDE.local.md         # project-specific claude instructions
├── skills/                 # project-specific skills
│   └── {skill-name}/
│       └── SKILL.md
└── install.sh              # creates symlinks into the project
```

Symlinks created by install.sh:
- `CLAUDE.local.md` → `.me/CLAUDE.local.md`
- `.claude/skills/` → `.me/skills/`
</structure>

<steps>
1. Create the `.me/` directory with a `skills/` subdirectory in the project root.

2. If `CLAUDE.local.md` already exists in the project root, move it into `.me/`. Otherwise create a new one.

3. If `.claude/skills/` already exists with project-specific skills, move the skill directories into `.me/skills/`. Then remove `.claude/skills/` (the symlink will replace it).

4. Create `.me/.gitignore` with this content to override the global gitignore:
```
!CLAUDE.local.md
```

5. Create `.me/install.sh` with this content:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

link() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [ -L "$dest" ]; then
    rm "$dest"
  elif [ -e "$dest" ]; then
    echo "backing up $dest → ${dest}.bak"
    mv "$dest" "${dest}.bak"
  fi
  ln -s "$src" "$dest"
  echo "linked $dest → $src"
}

link "$SCRIPT_DIR/CLAUDE.local.md" "$PROJECT_DIR/CLAUDE.local.md"

if [ -d "$SCRIPT_DIR/skills" ]; then
  link "$SCRIPT_DIR/skills" "$PROJECT_DIR/.claude/skills"
fi

echo "done"
```

6. Make install.sh executable: `chmod +x .me/install.sh`

7. Initialize `.me/` as a git repo: `git init && git add -A && git commit -m "initial commit"`

8. Run `.me/install.sh` to create the symlinks.

9. Clean up any backup files created (*.bak).
</steps>

<notes>
- After setup, new skills added to `.me/skills/{name}/SKILL.md` are immediately available with no re-install needed, because the entire skills directory is symlinked.
- On a fresh clone, the user just needs to clone/copy their `.me/` repo into the project root and run `.me/install.sh`.
- The `.me/` repo can be pushed to a private remote for backup and portability across machines.
</notes>
