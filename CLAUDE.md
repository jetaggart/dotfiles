# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a personal dotfiles repository for managing configuration files across machines.

## Current Configuration Files

- `.tmux.conf` - tmux configuration with Catppuccin Mocha theme

## Tmux Key Bindings

Prefix is `C-a` (Ctrl+a).

**Navigation:**
- `h/j/k/l` - vim-style pane navigation
- `M-h/j/k/l` - Alt+vim keys for pane navigation (no prefix)
- `M-1` through `M-5` - Alt+number for window selection (no prefix)
- `M-n/M-p` - Alt+n/p for next/previous window (no prefix)

**Splits and Windows:**
- `|` - vertical split
- `-` - horizontal split
- `c` - new window
- `g` - create 2x2 grid layout
- `G` - create 3-column horizontal layout

**Pane Management:**
- `m` / `M-z` - toggle pane zoom
- `x` - kill pane
- `X` - kill window
- `<` / `>` - swap pane up/down
- `S` - toggle synchronized panes

**Copy Mode (vi keys):**
- `v` - begin selection
- `y` - copy to system clipboard

**Utilities:**
- `r` - reload config
- `P` - toggle pane logging to ~/tmux-logs/
