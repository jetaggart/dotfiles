#!/bin/sh
session=$(tmux display-message -p '#{session_name}')
win_index=$(tmux display-message -p '#{window_index}')
pane_path=$(tmux display-message -p '#{pane_current_path}')

case "$session" in
  scratch-*) tmux detach-client ;;
  *) tmux display-popup -w 80% -h 80% -d "$pane_path" -E \
       "tmux new-session -A -s scratch-${session}-${win_index} -c \"$pane_path\"" ;;
esac
