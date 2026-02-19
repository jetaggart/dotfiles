# --- Oh My Zsh ---

export ZSH="$HOME/.oh-my-zsh"
DISABLE_AUTO_UPDATE=true
ZSH_THEME="robbyrussell"
plugins=(git)
source $ZSH/oh-my-zsh.sh

# --- Environment / PATH ---

export EDITOR="/opt/homebrew/bin/nvim"
export NVM_DIR="$HOME/.nvm"
export PNPM_HOME="/Users/jetaggart/Library/pnpm"
export PATH="/Users/jetaggart/.cursor/extensions/bin:$PNPM_HOME:$PATH"
export PATH="/Users/jetaggart/bin/tools:$PNPM_HOME:$PATH"

# --- General Aliases ---

alias vi=nvim
alias vim=nvim
alias ai=aichat
alias lg=lazygit
alias fix-dn='find "$HOME/.cursor/extensions" -type f -path "*/ms-dotnettools.csdevkit-*/dist/extension.js" -exec sed -i "" "s/checkHostApp=function(){return!!\[\"Visual Studio Code\"/checkHostApp=function(){return!!\[\"Cursor\",\"Visual Studio Code\"/" {} +'
alias br='bun run'

# --- Git: Add ---

alias g='git'
alias ga='git add'
alias gaa='git add --all'
alias gapa='git add --patch'
alias gau='git add --update'
alias gav='git add --verbose'
alias gap='git apply'
alias gapt='git apply --3way'

# --- Git: Branch ---

alias gb='git branch'
alias gba='git branch -a'
alias gbd='git branch -d'
alias gbda='git branch --no-color --merged | grep -vE "^(\[+\]|\s($(git_main_branch)|$(git_develop_branch))\s*$)" | xargs git branch -d 2>/dev/null'
alias gbD='git branch -D'
alias gbnm='git branch --no-merged'
alias gbr='git branch --remote'
alias gbl='git blame -b -w'

# --- Git: Bisect ---

alias gbs='git bisect'
alias gbsb='git bisect bad'
alias gbsg='git bisect good'
alias gbsr='git bisect reset'
alias gbss='git bisect start'

# --- Git: Commit ---

alias gc='git commit -v'
alias gc!='git commit -v --amend'
alias gcn!='git commit -v --no-edit --amend'
alias gca='git commit -v -a'
alias gca!='git commit -v -a --amend'
alias gcan!='git commit -v -a --no-edit --amend'
alias gcans!='git commit -v -a -s --no-edit --amend'
alias gcam='git commit -a -m'
alias gcas='git commit -a -s'
alias gcasm='git commit -a -s -m'
alias gcsm='git commit -s -m'
alias gcmsg='git commit -m'
alias gcs='git commit -S'

# --- Git: Checkout / Switch ---

alias gco='git checkout'
alias gcor='git checkout --recurse-submodules'
alias gcb='git checkout -b'
alias gcm='git checkout $(git_main_branch)'
alias gcd='git checkout $(git_develop_branch)'
alias gcf='git config --list'
alias gsw='git switch'
alias gswc='git switch -c'
alias gswm='git switch $(git_main_branch)'
alias gswd='git switch $(git_develop_branch)'

# --- Git: Clone / Clean ---

alias gcl='git clone --recurse-submodules'
alias gccd='git clone --recurse-submodules "$@" && cd "$(basename $_ .git)"'
alias gclean='git clean -id'
alias gpristine='git reset --hard && git clean -dffx'
alias gcount='git shortlog -sn'

# --- Git: Cherry-pick ---

alias gcp='git cherry-pick'
alias gcpa='git cherry-pick --abort'
alias gcpc='git cherry-pick --continue'

# --- Git: Diff ---

alias gd='git diff'
alias gdc='git diff --cached'
alias gdcw='git diff --cached --word-diff'
alias gds='git diff --staged'
alias gdt='git diff-tree --no-commit-id --name-only -r'
alias gdnolock='git diff $@ ":(exclude)package-lock.json" ":(exclude)*.lock"'
alias gdup='git diff @{upstream}'
alias gdv='git diff -w $@ | view -'
alias gdw='git diff --word-diff'
alias gdct='git describe --tags $(git rev-list --tags --max-count=1)'

# --- Git: Fetch ---

alias gf='git fetch'
alias gfa='git fetch --all --prune'
alias gfg='git ls-files | grep'
alias gfo='git fetch origin'

# --- Git: Push ---

alias gp='git push'
alias gpd='git push --dry-run'
alias gpf='git push --force-with-lease'
alias gpf!='git push --force'
alias gpoat='git push origin --all && git push origin --tags'
alias gpu='git push upstream'
alias gpv='git push -v'
alias gpsup='git push --set-upstream origin $(git_current_branch)'

# --- Git: Pull ---

alias gl='git pull'
alias gpr='git pull --rebase'
alias gup='git pull --rebase'
alias gupv='git pull --rebase -v'
alias gupa='git pull --rebase --autostash'
alias gupav='git pull --rebase --autostash -v'
alias gupom='git pull --rebase origin $(git_main_branch)'
alias gupomi='git pull --rebase=interactive origin $(git_main_branch)'
alias glum='git pull upstream $(git_main_branch)'
alias gluc='git pull upstream $(git_current_branch)'
alias ggpull='git pull origin "$(git_current_branch)"'
alias ggl='git pull origin $(current_branch)'
alias ggu='git pull --rebase origin $(current_branch)'
alias ggpur='ggu'

# --- Git: Push/Pull Combos ---

alias ggf='git push --force origin $(current_branch)'
alias ggfl='git push --force-with-lease origin $(current_branch)'
alias ggp='git push origin $(current_branch)'
alias ggpnp='ggl && ggp'
alias ggpush='git push origin "$(git_current_branch)"'
alias ggsup='git branch --set-upstream-to=origin/$(git_current_branch)'

# --- Git: Log ---

alias glg='git log --stat'
alias glgp='git log --stat -p'
alias glgg='git log --graph'
alias glgga='git log --graph --decorate --all'
alias glgm='git log --graph --max-count=10'
alias glo='git log --oneline --decorate'
alias glol='git log --graph --pretty="%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset"'
alias glols='git log --graph --pretty="%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset" --stat'
alias glod='git log --graph --pretty="%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ad) %C(bold blue)<%an>%Creset"'
alias glods='git log --graph --pretty="%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ad) %C(bold blue)<%an>%Creset" --date=short'
alias glola='git log --graph --pretty="%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset" --all'
alias glog='git log --oneline --decorate --graph'
alias gloga='git log --oneline --decorate --graph --all'
alias glp='git log --pretty=<format>'

# --- Git: Merge ---

alias gm='git merge'
alias gmom='git merge origin/$(git_main_branch)'
alias gmtl='git mergetool --no-prompt'
alias gmtlvim='git mergetool --no-prompt --tool=vimdiff'
alias gmum='git merge upstream/$(git_main_branch)'
alias gma='git merge --abort'
alias gmm="git fetch origin main && git merge origin/main"

# --- Git: Rebase ---

alias grb='git rebase'
alias grba='git rebase --abort'
alias grbc='git rebase --continue'
alias grbd='git rebase $(git_develop_branch)'
alias grbi='git rebase -i'
alias grbm='git rebase $(git_main_branch)'
alias grbom='git rebase origin/$(git_main_branch)'
alias grbo='git rebase --onto'
alias grbs='git rebase --skip'

# --- Git: Reset / Revert / Restore ---

alias grev='git revert'
alias grh='git reset'
alias grhh='git reset --hard'
alias groh='git reset origin/$(git_current_branch) --hard'
alias gru='git reset --'
alias grm='git rm'
alias grmc='git rm --cached'
alias grs='git restore'
alias grss='git restore --source'
alias grst='git restore --staged'

# --- Git: Remote ---

alias gr='git remote'
alias gra='git remote add'
alias grmv='git remote rename'
alias grrm='git remote remove'
alias grset='git remote set-url'
alias grup='git remote update'
alias grv='git remote -v'

# --- Git: Status / Show ---

alias gsb='git status -sb'
alias gss='git status -s'
alias gst='git status'
alias gs='git status'
alias gsh='git show'
alias gsps='git show --pretty=short --show-signature'

# --- Git: Stash ---

alias gsta='git stash push'
alias gstaa='git stash apply'
alias gstc='git stash clear'
alias gstd='git stash drop'
alias gstl='git stash list'
alias gstp='git stash pop'
alias gsts='git stash show --text'
alias gstu='git stash --include-untracked'
alias gstall='git stash --all'

# --- Git: Submodule / SVN ---

alias gsi='git submodule init'
alias gsu='git submodule update'
alias gsd='git svn dcommit'
alias gsr='git svn rebase'

# --- Git: Tag ---

alias gts='git tag -s'
alias gtv='git tag | sort -V'
alias gtl='gtl(){ git tag --sort=-v:refname -n -l ${1}* }; noglob gtl'

# --- Git: Misc ---

alias ghh='git help'
alias gignore='git update-index --assume-unchanged'
alias gignored='git ls-files -v | grep "^[[:lower:]]"'
alias gunignore='git update-index --no-assume-unchanged'
alias git-svn-dcommit-push='git svn dcommit && git push github $(git_main_branch):svntrunk'
alias gk='gitk --all --branches &!'
alias gke='gitk --all $(git log -g --pretty=%h) &!'
alias grt='cd "$(git rev-parse --show-toplevel || echo .)"'
alias gwch='git whatchanged -p --abbrev-commit --pretty=medium'
alias gwip='git add -A; git rm $(git ls-files --deleted) 2> /dev/null; git commit --no-verify --no-gpg-sign -m "--wip-- [skip ci]"'
alias gunwip='git log -n 1 | grep -q -c "--wip--" && git reset HEAD~1'
alias gam='git am'
alias gamc='git am --continue'
alias gams='git am --skip'
alias gama='git am --abort'
alias gamscp='git am --show-current-patch'
alias gg='git gui citool'
alias gga='git gui citool --amend'

# --- Lettuce ---
alias lalogin='aws sso login --sso-session lettuce'

bindkey -v
bindkey '\e^?' unix-word-rubout
bindkey -M viins '^P' up-history
bindkey -M viins '^N' down-history
setopt prompt_subst
VIM_MODE='[I]'
zle-keymap-select() {
  [[ $KEYMAP == vicmd ]] && VIM_MODE='[N]' || VIM_MODE='[I]'
  zle reset-prompt
}
zle-line-init() {
  zle -K viins
  VIM_MODE='[I]'
}
zle -N zle-keymap-select
zle -N zle-line-init
PROMPT='${VIM_MODE} '"${PROMPT}"

# --- Functions ---

trash() {
  for file in "$@"; do
    if [[ -e "$file" ]]; then
      local filename=$(basename "$file")
      local dest="$HOME/.Trash/$filename"
      if [[ -e "$dest" ]]; then
        dest="$HOME/.Trash/${filename}_$(date +%Y%m%d_%H%M%S)"
      fi
      mv "$file" "$dest"
    else
      echo "trash: $file: No such file or directory"
    fi
  done
}

wtn() {
  local branch=$1
  local repo_name=$(basename $(git rev-parse --show-toplevel))
  local parent_dir=$(dirname $(git rev-parse --show-toplevel))
  local worktree_path="$parent_dir/$repo_name-$branch"
  git worktree add "$worktree_path" "$branch" 2>/dev/null || git worktree add -b "$branch" "$worktree_path"
  cd "$worktree_path"
}

wtd() {
  local branch=$1
  local repo_name=$(basename $(git rev-parse --show-toplevel))
  local parent_dir=$(dirname $(git rev-parse --show-toplevel))
  local worktree_path="$parent_dir/$repo_name-$branch"
  git worktree remove "$worktree_path"
}

cvsc() {
  BRANCH=$(git branch --show-current 2>/dev/null)
  if [ -z "$BRANCH" ]; then
    echo "Not in a git repo"
    return 1
  fi

  DIR_NAME=${PWD##*/}
  HASH=$(echo -n "$DIR_NAME-$BRANCH" | md5 | head -c 6)
  COLOR="#$HASH"

  mkdir -p .vscode
  cat > .vscode/settings.json << SETTINGS
{
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "$COLOR",
    "titleBar.activeForeground": "#FFFFFF"
  }
}
SETTINGS

  echo "Set title bar color to $COLOR for $DIR_NAME:$BRANCH"
}

# --- Runtime Setup ---

source <(fzf --zsh)
source ${HOME}/.ghcup/env
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
