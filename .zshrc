export ZSH="$HOME/.oh-my-zsh"
DISABLE_AUTO_UPDATE=true
ZSH_THEME="robbyrussell"
plugins=(git)
source $ZSH/oh-my-zsh.sh

export EDITOR="/opt/homebrew/bin/nvim"
export NVM_DIR="$HOME/.nvm"
export PNPM_HOME="/Users/jetaggart/Library/pnpm"
export PATH="/Users/jetaggart/.codeium/windsurf/bin:$PNPM_HOME:$PATH"

alias vi=nvim
alias vim=nvim
alias ai=aichat
alias lg=lazygit

alias g='git'
alias ga='git add'
alias gaa='git add --all'
alias gapa='git add --patch'
alias gau='git add --update'
alias gav='git add --verbose'
alias gap='git apply'
alias gapt='git apply --3way'

alias gb='git branch'
alias gba='git branch -a'
alias gbd='git branch -d'
alias gbda='git branch --no-color --merged | grep -vE "^(\[+\]|\s($(git_main_branch)|$(git_develop_branch))\s*$)" | xargs git branch -d 2>/dev/null'
alias gbD='git branch -D'
alias gbnm='git branch --no-merged'
alias gbr='git branch --remote'
alias gbl='git blame -b -w'

alias gbs='git bisect'
alias gbsb='git bisect bad'
alias gbsg='git bisect good'
alias gbsr='git bisect reset'
alias gbss='git bisect start'

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

alias gco='git checkout'
alias gcor='git checkout --recurse-submodules'
alias gcb='git checkout -b'
alias gcm='git checkout $(git_main_branch)'
alias gcd='git checkout $(git_develop_branch)'
alias gcf='git config --list'

alias gcl='git clone --recurse-submodules'
alias gccd='git clone --recurse-submodules "$@" && cd "$(basename $_ .git)"'
alias gclean='git clean -id'
alias gpristine='git reset --hard && git clean -dffx'
alias gcount='git shortlog -sn'

alias gcp='git cherry-pick'
alias gcpa='git cherry-pick --abort'
alias gcpc='git cherry-pick --continue'

alias gd='git diff'
alias gdca='git diff --cached'
alias gdcw='git diff --cached --word-diff'
alias gds='git diff --staged'
alias gdt='git diff-tree --no-commit-id --name-only -r'
alias gdnolock='git diff $@ ":(exclude)package-lock.json" ":(exclude)*.lock"'
alias gdup='git diff @{upstream}'
alias gdv='git diff -w $@ | view -'
alias gdw='git diff --word-diff'
alias gdct='git describe --tags $(git rev-list --tags --max-count=1)'

alias gf='git fetch'
alias gfa='git fetch --all --prune'
alias gfg='git ls-files | grep'
alias gfo='git fetch origin'

alias gg='git gui citool'
alias gga='git gui citool --amend'
alias ggf='git push --force origin $(current_branch)'
alias ggfl='git push --force-with-lease origin $(current_branch)'
alias ggl='git pull origin $(current_branch)'
alias ggp='git push origin $(current_branch)'
alias ggpnp='ggl && ggp'
alias ggpull='git pull origin "$(git_current_branch)"'
alias ggpur='ggu'
alias ggpush='git push origin "$(git_current_branch)"'
alias ggsup='git branch --set-upstream-to=origin/$(git_current_branch)'
alias ggu='git pull --rebase origin $(current_branch)'
alias gpsup='git push --set-upstream origin $(git_current_branch)'

alias ghh='git help'
alias gignore='git update-index --assume-unchanged'
alias gignored='git ls-files -v | grep "^[[:lower:]]"'
alias gunignore='git update-index --no-assume-unchanged'
alias git-svn-dcommit-push='git svn dcommit && git push github $(git_main_branch):svntrunk'

alias gk='gitk --all --branches &!'
alias gke='gitk --all $(git log -g --pretty=%h) &!'

alias gl='git pull'
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

alias gm='git merge'
alias gmom='git merge origin/$(git_main_branch)'
alias gmtl='git mergetool --no-prompt'
alias gmtlvim='git mergetool --no-prompt --tool=vimdiff'
alias gmum='git merge upstream/$(git_main_branch)'
alias gma='git merge --abort'

alias gp='git push'
alias gpd='git push --dry-run'
alias gpf='git push --force-with-lease'
alias gpf!='git push --force'
alias gpoat='git push origin --all && git push origin --tags'
alias gpr='git pull --rebase'
alias gpu='git push upstream'
alias gpv='git push -v'

alias gr='git remote'
alias gra='git remote add'
alias grmv='git remote rename'
alias grrm='git remote remove'
alias grset='git remote set-url'
alias grup='git remote update'
alias grv='git remote -v'

alias grb='git rebase'
alias grba='git rebase --abort'
alias grbc='git rebase --continue'
alias grbd='git rebase $(git_develop_branch)'
alias grbi='git rebase -i'
alias grbm='git rebase $(git_main_branch)'
alias grbom='git rebase origin/$(git_main_branch)'
alias grbo='git rebase --onto'
alias grbs='git rebase --skip'

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
alias grt='cd "$(git rev-parse --show-toplevel || echo .)"'

alias gsb='git status -sb'
alias gss='git status -s'
alias gst='git status'
alias gs='git status'

alias gsd='git svn dcommit'
alias gsr='git svn rebase'

alias gsh='git show'
alias gsps='git show --pretty=short --show-signature'

alias gsi='git submodule init'
alias gsu='git submodule update'

alias gsta='git stash push'
alias gstaa='git stash apply'
alias gstc='git stash clear'
alias gstd='git stash drop'
alias gstl='git stash list'
alias gstp='git stash pop'
alias gsts='git stash show --text'
alias gstu='git stash --include-untracked'
alias gstall='git stash --all'

alias gsw='git switch'
alias gswc='git switch -c'
alias gswm='git switch $(git_main_branch)'
alias gswd='git switch $(git_develop_branch)'

alias gts='git tag -s'
alias gtv='git tag | sort -V'
alias gtl='gtl(){ git tag --sort=-v:refname -n -l ${1}* }; noglob gtl'

alias gwch='git whatchanged -p --abbrev-commit --pretty=medium'
alias gwip='git add -A; git rm $(git ls-files --deleted) 2> /dev/null; git commit --no-verify --no-gpg-sign -m "--wip-- [skip ci]"'
alias gunwip='git log -n 1 | grep -q -c "--wip--" && git reset HEAD~1'

alias gam='git am'
alias gamc='git am --continue'
alias gams='git am --skip'
alias gama='git am --abort'
alias gamscp='git am --show-current-patch'

alias gup='git pull --rebase'
alias gupv='git pull --rebase -v'
alias gupa='git pull --rebase --autostash'
alias gupav='git pull --rebase --autostash -v'
alias gupom='git pull --rebase origin $(git_main_branch)'
alias gupomi='git pull --rebase=interactive origin $(git_main_branch)'
alias glum='git pull upstream $(git_main_branch)'
alias gluc='git pull upstream $(git_current_branch)'

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

workon() {
  local branch=$1
  local repo_name=$(basename $(git rev-parse --show-toplevel))
  local parent_dir=$(dirname $(git rev-parse --show-toplevel))
  local worktree_path="$parent_dir/$repo_name-$branch"
  git worktree add "$worktree_path" "$branch" 2>/dev/null || git worktree add -b "$branch" "$worktree_path"
  cd "$worktree_path"
}

source ${HOME}/.ghcup/env
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
