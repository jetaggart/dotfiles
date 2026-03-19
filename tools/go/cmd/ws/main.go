package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"dotfiles/tools/internal/git"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

var (
	cyan    = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	gray    = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	green   = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	yellow  = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	red     = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
	bold    = lipgloss.NewStyle().Bold(true)
	magenta = lipgloss.NewStyle().Foreground(lipgloss.Color("5"))

	titleBar     = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))
	panel        = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("62")).Padding(0, 1)
	summaryPanel = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("35")).Padding(0, 1)
	historyPanel = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(lipgloss.Color("240")).Padding(0, 1).MarginBottom(1)
	rule         = lipgloss.NewStyle().Foreground(lipgloss.Color("236"))
	statusPanel  = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("63")).Padding(0, 1).MarginBottom(1)

	home    = os.Getenv("HOME")
	presets = map[string]struct{ source, target string }{
		"lettuce": {
			source: filepath.Join(home, "code", "lettuce"),
			target: filepath.Join(home, "code", "lettuce", "workspaces"),
		},
	}

	wsConfig    = ".ws.json"
	symlinkDirs = []string{".me", ".claude"}
)

type focusMap map[string][]string

func focusLabel(dirs []string) string {
	for _, d := range dirs {
		if d == "*" {
			return "everything"
		}
	}
	return strings.Join(dirs, ", ")
}

func findRepos(sourceDir string) []string {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return nil
	}
	var repos []string
	for _, e := range entries {
		if !e.IsDir() || e.Name() == "workspaces" || e.Name() == "workspace" || e.Name() == ".me" {
			continue
		}
		gitDir := filepath.Join(sourceDir, e.Name(), ".git")
		if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
			repos = append(repos, e.Name())
		}
	}
	sort.Strings(repos)
	return repos
}

func findTopLevelDirs(repoPath string) []string {
	entries, err := os.ReadDir(repoPath)
	if err != nil {
		return nil
	}
	var dirs []string
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		dirs = append(dirs, e.Name())
	}
	sort.Strings(dirs)
	return dirs
}

func findWsDir() (source, wsDir string, ok bool) {
	dir, _ := os.Getwd()
	for {
		configPath := filepath.Join(dir, wsConfig)
		if data, err := os.ReadFile(configPath); err == nil {
			var cfg struct {
				Source string `json:"source"`
			}
			if json.Unmarshal(data, &cfg) == nil {
				return cfg.Source, dir, true
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", "", false
}

func writeWsConfig(wsDir, source string) {
	data, _ := json.MarshalIndent(map[string]string{"source": source}, "", "  ")
	os.WriteFile(filepath.Join(wsDir, wsConfig), append(data, '\n'), 0644)
}

func readFocusDirs(wsDir string) focusMap {
	data, err := os.ReadFile(filepath.Join(wsDir, "CLAUDE.local.md"))
	if err != nil {
		return focusMap{}
	}
	content := string(data)
	result := focusMap{}

	re2 := regexp.MustCompile(`(?m)^- (.+?)/(.+?)/$`)
	for _, m := range re2.FindAllStringSubmatch(content, -1) {
		result[m[1]] = append(result[m[1]], m[2])
	}

	re1 := regexp.MustCompile(`(?m)^- ([^/]+?)/$`)
	for _, m := range re1.FindAllStringSubmatch(content, -1) {
		if _, exists := result[m[1]]; !exists {
			result[m[1]] = []string{"*"}
		}
	}

	return result
}

func writeFocusConfig(wsDir string, focus focusMap) {
	type entry struct {
		repo string
		dir  string
	}
	var entries []entry
	var allRepos []string
	for repo := range focus {
		allRepos = append(allRepos, repo)
	}
	sort.Strings(allRepos)

	for _, repo := range allRepos {
		dirs := focus[repo]
		hasAll := false
		for _, d := range dirs {
			if d == "*" {
				hasAll = true
				break
			}
		}
		if hasAll {
			entries = append(entries, entry{repo, ""})
		} else {
			for _, d := range dirs {
				entries = append(entries, entry{repo, d})
			}
		}
	}

	localPath := filepath.Join(wsDir, "CLAUDE.local.md")
	if len(entries) == 0 {
		os.Remove(localPath)
		return
	}

	var lines []string
	for _, e := range entries {
		if e.dir != "" {
			lines = append(lines, fmt.Sprintf("- %s/%s/", e.repo, e.dir))
		} else {
			lines = append(lines, fmt.Sprintf("- %s/", e.repo))
		}
	}

	content := fmt.Sprintf("<focus>\nOnly modify files in these directories:\n%s\n\nYou may read from any directory in the workspace for context: %s\n</focus>\n",
		strings.Join(lines, "\n"), strings.Join(allRepos, ", "))
	os.WriteFile(localPath, []byte(content), 0644)

	type folder struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	var folders []folder
	for _, e := range entries {
		if e.dir != "" {
			folders = append(folders, folder{filepath.Join(e.repo, e.dir), e.repo + "/" + e.dir})
		} else {
			folders = append(folders, folder{e.repo, e.repo})
		}
	}
	wsData, _ := json.MarshalIndent(map[string]any{
		"folders":  folders,
		"settings": map[string]any{"files.exclude": map[string]any{"**/.git": true, ".ws.json": true}},
	}, "", "  ")
	os.WriteFile(filepath.Join(wsDir, filepath.Base(wsDir)+".code-workspace"), append(wsData, '\n'), 0644)
}

func getDefaultBranch(repoPath string) string {
	ref := git.Run("symbolic-ref refs/remotes/origin/HEAD", repoPath)
	if ref != "" {
		return strings.TrimPrefix(ref, "refs/remotes/origin/")
	}
	return "main"
}

type repoCheckResult struct {
	repo string
	ok   bool
	msg  string
}

func prepareRepo(repoPath string) (bool, string) {
	defaultBranch := getDefaultBranch(repoPath)
	current, err := git.RunArgs([]string{"rev-parse", "--abbrev-ref", "HEAD"}, repoPath)
	if err != nil {
		return false, "not a git repo"
	}
	if current != defaultBranch {
		return false, fmt.Sprintf("on branch '%s', expected '%s'", current, defaultBranch)
	}
	status, err := git.RunArgs([]string{"status", "--porcelain"}, repoPath)
	if err != nil {
		return false, "git status failed"
	}
	if status != "" {
		return false, "has uncommitted changes"
	}
	if _, err := git.RunArgs([]string{"pull", "--rebase"}, repoPath); err != nil {
		return false, "pull failed: " + git.ErrorMsg(err)
	}
	return true, "ready"
}

func symlinkIgnoredDirs(srcRoot, dstRoot string) {
	var walk func(dir string)
	walk = func(dir string) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			name := e.Name()
			if name == "node_modules" || name == ".git" || name == ".venv" || name == "venv" {
				continue
			}
			srcPath := filepath.Join(dir, name)
			isSymlinkDir := false
			for _, sd := range symlinkDirs {
				if name == sd {
					isSymlinkDir = true
					break
				}
			}
			if isSymlinkDir {
				rel, _ := filepath.Rel(srcRoot, srcPath)
				dstPath := filepath.Join(dstRoot, rel)
				if _, err := os.Lstat(dstPath); err != nil {
					os.MkdirAll(filepath.Dir(dstPath), 0755)
					os.Symlink(srcPath, dstPath)
				}
			} else {
				walk(srcPath)
			}
		}
	}
	walk(srcRoot)
}

func createWorktree(repoPath, dest, branch string) error {
	_, err := git.RunArgs([]string{"worktree", "add", dest, "-b", branch}, repoPath)
	if err != nil {
		_, err = git.RunArgs([]string{"worktree", "add", dest, branch}, repoPath)
		if err != nil {
			return err
		}
	}

	bootstrapDirs := []string{"node_modules", ".venv", "venv"}
	bootstrapFiles := []string{".env", ".env.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".env.production", ".env.production.local", "pyrightconfig.json"}

	for _, dir := range bootstrapDirs {
		src := filepath.Join(repoPath, dir)
		dst := filepath.Join(dest, dir)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		exec.Command("cp", "-a", src, dst).Run()
	}

	for _, file := range bootstrapFiles {
		src := filepath.Join(repoPath, file)
		dst := filepath.Join(dest, file)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		data, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		os.WriteFile(dst, data, 0644)
	}

	symlinkIgnoredDirs(repoPath, dest)
	return nil
}

type multiSelectModel struct {
	message        string
	options        []string
	optionDim      []bool
	cursor         int
	selected       map[int]bool
	exclusiveFirst bool
	done           bool
	cancelled      bool
}

func newMultiSelect(message string, options []string, exclusiveFirst bool) multiSelectModel {
	dim := make([]bool, len(options))
	if exclusiveFirst && len(options) > 0 {
		dim[0] = true
	}
	return multiSelectModel{
		message:        message,
		options:        options,
		optionDim:      dim,
		selected:       make(map[int]bool),
		exclusiveFirst: exclusiveFirst,
	}
}

func (m multiSelectModel) Init() tea.Cmd { return nil }

func (m multiSelectModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if msg, ok := msg.(tea.KeyPressMsg); ok {
		switch msg.String() {
		case "up", "k":
			m.cursor--
			if m.cursor < 0 {
				m.cursor = len(m.options) - 1
			}
		case "down", "j":
			m.cursor++
			if m.cursor >= len(m.options) {
				m.cursor = 0
			}
		case "space":
			if m.selected[m.cursor] {
				delete(m.selected, m.cursor)
			} else {
				m.selected[m.cursor] = true
				if m.exclusiveFirst {
					if m.cursor == 0 {
						for i := 1; i < len(m.options); i++ {
							delete(m.selected, i)
						}
					} else {
						delete(m.selected, 0)
					}
				}
			}
		case "a":
			if len(m.selected) == len(m.options) {
				m.selected = make(map[int]bool)
			} else if m.exclusiveFirst {
				m.selected = make(map[int]bool)
				for i := 1; i < len(m.options); i++ {
					m.selected[i] = true
				}
			} else {
				m.selected = make(map[int]bool)
				for i := range m.options {
					m.selected[i] = true
				}
			}
		case "enter":
			if len(m.selected) > 0 {
				m.done = true
				return m, nil
			}
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, nil
		}
	}
	return m, nil
}

func (m multiSelectModel) View() tea.View {
	return tea.NewView(m.render())
}

func (m multiSelectModel) render() string {
	var s strings.Builder
	s.WriteString(cyan.Bold(true).Render(m.message) + "\n")
	s.WriteString(rule.Render(strings.Repeat("─", promptUnderline(len(m.message)))) + "\n")
	for i, opt := range m.options {
		cursor := " "
		if i == m.cursor {
			cursor = cyan.Render(">")
		}
		check := gray.Render(" ◻")
		if m.selected[i] {
			check = green.Render(" ◼")
		}
		label := opt
		if m.optionDim[i] {
			label = gray.Render(opt)
		}
		s.WriteString(fmt.Sprintf("%s%s %s\n", cursor, check, label))
	}
	s.WriteString(magenta.Render("space") + gray.Render(" toggle  ") + magenta.Render("a") + gray.Render(" all  ") + magenta.Render("enter") + gray.Render(" confirm") + "\n")
	return s.String()
}

func (m multiSelectModel) Values() []string {
	var indices []int
	for i := range m.selected {
		indices = append(indices, i)
	}
	sort.Ints(indices)
	var values []string
	for _, i := range indices {
		values = append(values, m.options[i])
	}
	return values
}

type selectModel struct {
	message   string
	options   []string
	hints     []string
	cursor    int
	done      bool
	cancelled bool
}

func newSelect(message string, options, hints []string) selectModel {
	return selectModel{message: message, options: options, hints: hints}
}

func (m selectModel) Init() tea.Cmd { return nil }

func (m selectModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if msg, ok := msg.(tea.KeyPressMsg); ok {
		switch msg.String() {
		case "up", "k":
			m.cursor--
			if m.cursor < 0 {
				m.cursor = len(m.options) - 1
			}
		case "down", "j":
			m.cursor++
			if m.cursor >= len(m.options) {
				m.cursor = 0
			}
		case "enter":
			m.done = true
			return m, nil
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, nil
		}
	}
	return m, nil
}

func (m selectModel) View() tea.View {
	return tea.NewView(m.render())
}

func (m selectModel) render() string {
	var s strings.Builder
	s.WriteString(cyan.Bold(true).Render(m.message) + "\n")
	s.WriteString(rule.Render(strings.Repeat("─", promptUnderline(len(m.message)))) + "\n")
	for i, opt := range m.options {
		cursor := " "
		if i == m.cursor {
			cursor = cyan.Render(">")
		}
		hint := ""
		if i < len(m.hints) && m.hints[i] != "" {
			hint = " " + gray.Render(m.hints[i])
		}
		s.WriteString(fmt.Sprintf("%s %s%s\n", cursor, opt, hint))
	}
	s.WriteString(magenta.Render("j") + gray.Render("/") + magenta.Render("k") + gray.Render(" move  ") + magenta.Render("enter") + gray.Render(" pick") + "\n")
	return s.String()
}

type confirmModel struct {
	message   string
	done      bool
	result    bool
	cancelled bool
}

func newConfirm(message string) confirmModel {
	return confirmModel{message: message}
}

func (m confirmModel) Init() tea.Cmd { return nil }

func (m confirmModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if msg, ok := msg.(tea.KeyPressMsg); ok {
		switch msg.String() {
		case "y", "Y":
			m.result = true
			m.done = true
			return m, nil
		case "n", "N":
			m.result = false
			m.done = true
			return m, nil
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, nil
		}
	}
	return m, nil
}

func (m confirmModel) View() tea.View {
	return tea.NewView(cyan.Bold(true).Render(m.message) + " " + gray.Render("(y/n)") + "\n")
}

func promptUnderline(titleLen int) int {
	w := titleLen + 12
	if w < 36 {
		w = 36
	}
	if w > 58 {
		w = 58
	}
	return w
}

func listLeftovers(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var items []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			name += "/"
		}
		items = append(items, name)
	}
	sort.Strings(items)
	return items
}

func parseCreateArgs(rest []string) (useTmux bool, pos []string) {
	for _, a := range rest {
		if a == "--tmux" {
			useTmux = true
			continue
		}
		pos = append(pos, a)
	}
	return useTmux, pos
}

func runCreate(source, workspaces string, useTmux bool) {
	repos := findRepos(source)
	if len(repos) == 0 {
		fmt.Println(red.Render("no git repos found in " + source))
		return
	}
	if _, err := tea.NewProgram(newAppCreate(source, workspaces, repos, useTmux)).Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runAdd(source, wsDir string) {
	repos := findRepos(source)
	if len(repos) == 0 {
		fmt.Println(red.Render("no git repos found in " + source))
		return
	}
	hints := make([]string, len(repos))
	for i, repo := range repos {
		if _, err := os.Stat(filepath.Join(wsDir, repo)); err == nil {
			hints[i] = "already in workspace"
		}
	}
	if _, err := tea.NewProgram(newAppAdd(source, wsDir, repos, hints)).Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runDelete(source, wsDir string) {
	entries, err := os.ReadDir(wsDir)
	if err != nil {
		fmt.Println(red.Render("cannot read workspace: " + err.Error()))
		return
	}
	var repos []string
	for _, e := range entries {
		if !e.IsDir() || e.Name() == wsConfig {
			continue
		}
		repos = append(repos, e.Name())
	}
	sort.Strings(repos)
	if len(repos) == 0 {
		fmt.Println(red.Render("no repos in workspace"))
		return
	}
	var dirty []string
	for _, repo := range repos {
		status := git.Run("status --porcelain", filepath.Join(wsDir, repo))
		if status != "" {
			dirty = append(dirty, repo)
		}
	}
	msg := fmt.Sprintf("delete workspace %s? (%s)", filepath.Base(wsDir), strings.Join(repos, ", "))
	if len(dirty) > 0 {
		msg = "uncommitted changes in: " + strings.Join(dirty, ", ") + ". delete anyway?"
	}
	if _, err := tea.NewProgram(newAppDelete(source, wsDir, repos, dirty, msg)).Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		printUsage()
		os.Exit(1)
	}

	command := args[0]
	rest := args[1:]

	switch command {
	case "create":
		useTmux, cargs := parseCreateArgs(rest)
		if len(cargs) == 1 {
			if preset, ok := presets[cargs[0]]; ok {
				runCreate(preset.source, preset.target, useTmux)
				return
			}
		}
		if len(cargs) == 2 {
			source, _ := filepath.Abs(cargs[0])
			target, _ := filepath.Abs(cargs[1])
			runCreate(source, target, useTmux)
			return
		}
		fmt.Fprintln(os.Stderr, "usage: ws create [--tmux] <preset> | ws create [--tmux] <source_dir> <target_dir>")
		fmt.Fprintf(os.Stderr, "presets: %s\n", presetNames())
		os.Exit(1)

	case "add":
		source, wsDir, ok := findWsDir()
		if !ok {
			fmt.Fprintln(os.Stderr, "not in a workspace directory (no .ws.json found)")
			os.Exit(1)
		}
		runAdd(source, wsDir)

	case "delete":
		if len(rest) != 1 {
			fmt.Fprintln(os.Stderr, "usage: ws delete <workspace_dir>")
			os.Exit(1)
		}
		wsDir, _ := filepath.Abs(rest[0])
		configPath := filepath.Join(wsDir, wsConfig)
		data, err := os.ReadFile(configPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "not a workspace directory (no .ws.json in %s)\n", wsDir)
			os.Exit(1)
		}
		var cfg struct {
			Source string `json:"source"`
		}
		json.Unmarshal(data, &cfg)
		runDelete(cfg.Source, wsDir)

	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	head := titleBar.Render("ws") + gray.Render(" — workspace manager")
	body := lipgloss.JoinVertical(lipgloss.Left,
		head,
		"",
		cyan.Render("create")+gray.Render("  ws create [--tmux] <preset>")+magenta.Render(" · ")+gray.Render("ws create [--tmux] <src> <dst>"),
		cyan.Render("add")+gray.Render("     ws add")+magenta.Render(" · ")+gray.Render("from inside a workspace"),
		cyan.Render("delete")+gray.Render("  ws delete <dir>"),
		"",
		gray.Render("presets  ")+yellow.Render(presetNames()),
	)
	fmt.Fprintln(os.Stderr, panel.BorderForeground(lipgloss.Color("241")).Render(body))
}

func presetNames() string {
	var names []string
	for k := range presets {
		names = append(names, k)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}
