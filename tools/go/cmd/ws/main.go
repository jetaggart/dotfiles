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

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	cyan   = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	gray   = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	green  = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	yellow = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	red    = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
	bold   = lipgloss.NewStyle().Bold(true)

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
	if msg, ok := msg.(tea.KeyMsg); ok {
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
		case " ":
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
				return m, tea.Quit
			}
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m multiSelectModel) View() string {
	var s strings.Builder
	s.WriteString(cyan.Bold(true).Render(m.message) + "\n")
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
	s.WriteString(gray.Render("space: toggle, a: all, enter: confirm") + "\n")
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
	if msg, ok := msg.(tea.KeyMsg); ok {
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
			return m, tea.Quit
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m selectModel) View() string {
	var s strings.Builder
	s.WriteString(cyan.Bold(true).Render(m.message) + "\n")
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
	return s.String()
}

type textInputModel struct {
	message   string
	value     string
	err       string
	done      bool
	cancelled bool
}

func newTextInput(message string) textInputModel {
	return textInputModel{message: message}
}

func (m textInputModel) Init() tea.Cmd { return nil }

func (m textInputModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if msg, ok := msg.(tea.KeyMsg); ok {
		switch msg.String() {
		case "enter":
			if m.value == "" {
				m.err = "required"
			} else {
				m.done = true
				return m, tea.Quit
			}
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, tea.Quit
		case "backspace":
			if len(m.value) > 0 {
				m.value = m.value[:len(m.value)-1]
			}
			m.err = ""
		default:
			if len(msg.String()) == 1 {
				m.value += msg.String()
				m.err = ""
			}
		}
	}
	return m, nil
}

func (m textInputModel) View() string {
	var s strings.Builder
	s.WriteString(cyan.Bold(true).Render(m.message) + "\n")
	s.WriteString(green.Render("> ") + m.value + gray.Render("_") + "\n")
	if m.err != "" {
		s.WriteString(red.Render(m.err) + "\n")
	}
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
	if msg, ok := msg.(tea.KeyMsg); ok {
		switch msg.String() {
		case "y", "Y":
			m.result = true
			m.done = true
			return m, tea.Quit
		case "n", "N":
			m.result = false
			m.done = true
			return m, tea.Quit
		case "esc", "ctrl+c":
			m.cancelled = true
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m confirmModel) View() string {
	return cyan.Bold(true).Render(m.message) + " " + gray.Render("(y/n)") + "\n"
}

func runMultiSelect(message string, options []string, exclusiveFirst bool) ([]string, bool) {
	m := newMultiSelect(message, options, exclusiveFirst)
	p := tea.NewProgram(m)
	result, err := p.Run()
	if err != nil {
		return nil, false
	}
	final := result.(multiSelectModel)
	if final.cancelled {
		return nil, false
	}
	return final.Values(), true
}

func runSelect(message string, options, hints []string) (int, bool) {
	m := newSelect(message, options, hints)
	p := tea.NewProgram(m)
	result, err := p.Run()
	if err != nil {
		return 0, false
	}
	final := result.(selectModel)
	if final.cancelled {
		return 0, false
	}
	return final.cursor, true
}

func runTextInput(message string) (string, bool) {
	m := newTextInput(message)
	p := tea.NewProgram(m)
	result, err := p.Run()
	if err != nil {
		return "", false
	}
	final := result.(textInputModel)
	if final.cancelled {
		return "", false
	}
	return final.value, true
}

func runConfirm(message string) (bool, bool) {
	m := newConfirm(message)
	p := tea.NewProgram(m)
	result, err := p.Run()
	if err != nil {
		return false, false
	}
	final := result.(confirmModel)
	if final.cancelled {
		return false, false
	}
	return final.result, true
}

func printHistory(entries []string) {
	for _, e := range entries {
		fmt.Println(gray.Render(e))
	}
	if len(entries) > 0 {
		fmt.Println()
	}
}

func cmdCreate(source, workspacesDir string) {
	repos := findRepos(source)
	if len(repos) == 0 {
		fmt.Println(red.Render("no git repos found in " + source))
		return
	}

	var history []string

	selected, ok := runMultiSelect("select repos", repos, false)
	if !ok || len(selected) == 0 {
		return
	}
	sort.Strings(selected)
	history = append(history, "repos: "+strings.Join(selected, ", "))

	printHistory(history)
	fmt.Println(gray.Render("checking repos..."))

	var issues []string
	for _, repo := range selected {
		ok, msg := prepareRepo(filepath.Join(source, repo))
		if !ok {
			issues = append(issues, repo+": "+msg)
		}
	}
	if len(issues) > 0 {
		for _, issue := range issues {
			fmt.Println(red.Render(issue))
		}
		fmt.Println(red.Render("fix the issues above and try again"))
		return
	}
	history = append(history, "repos checked")

	printHistory(history)
	wsName, ok := runTextInput("workspace name")
	if !ok {
		return
	}
	history = append(history, "name: "+wsName)

	focus := focusMap{}
	for _, repo := range selected {
		repoPath := filepath.Join(source, repo)
		dirs := findTopLevelDirs(repoPath)
		if len(dirs) == 0 {
			focus[repo] = []string{"*"}
			history = append(history, repo+": everything")
			continue
		}

		printHistory(history)
		options := append([]string{"everything"}, dirs...)
		values, ok := runMultiSelect(repo+": focus directories", options, true)
		if !ok {
			return
		}
		for i, v := range values {
			if v == "everything" {
				values[i] = "*"
			}
		}
		hasAll := false
		for _, v := range values {
			if v == "*" {
				hasAll = true
				break
			}
		}
		if hasAll {
			focus[repo] = []string{"*"}
		} else {
			focus[repo] = values
		}
		history = append(history, repo+": "+focusLabel(focus[repo]))
	}

	printHistory(history)
	fmt.Println(gray.Render("creating workspace..."))

	wsDir := filepath.Join(workspacesDir, wsName)
	os.MkdirAll(wsDir, 0755)
	writeWsConfig(wsDir, source)

	claudeMd := filepath.Join(source, "CLAUDE.md")
	if _, err := os.Stat(claudeMd); err == nil {
		os.Symlink(claudeMd, filepath.Join(wsDir, "CLAUDE.md"))
	}

	for _, dir := range symlinkDirs {
		src := filepath.Join(source, dir)
		dst := filepath.Join(wsDir, dir)
		if _, err := os.Stat(src); err == nil {
			if _, err := os.Lstat(dst); err != nil {
				os.Symlink(src, dst)
			}
		}
	}

	type result struct {
		repo string
		ok   bool
		msg  string
	}
	var results []result
	for _, repo := range selected {
		err := createWorktree(filepath.Join(source, repo), filepath.Join(wsDir, repo), wsName)
		if err != nil {
			results = append(results, result{repo, false, git.ErrorMsg(err)})
		} else {
			results = append(results, result{repo, true, "focus: " + focusLabel(focus[repo])})
		}
	}

	writeFocusConfig(wsDir, focus)

	printHistory(history)
	fmt.Println(bold.Render("workspace: " + wsDir))
	for _, r := range results {
		if r.ok {
			fmt.Println(green.Render("+") + " " + r.repo + ": " + r.msg)
		} else {
			fmt.Println(red.Render("x") + " " + r.repo + ": " + r.msg)
		}
	}

	if os.Getenv("TMUX") != "" {
		exec.Command("tmux", "new-window", "-c", wsDir, "-n", wsName).Run()
		fmt.Println(green.Render("opened tmux window: " + wsName))
	} else {
		fmt.Println(gray.Render("cd " + wsDir))
	}
}

func cmdAdd(source, wsDir string) {
	repos := findRepos(source)
	if len(repos) == 0 {
		fmt.Println(red.Render("no git repos found in " + source))
		return
	}

	var history []string

	hints := make([]string, len(repos))
	for i, repo := range repos {
		if _, err := os.Stat(filepath.Join(wsDir, repo)); err == nil {
			hints[i] = "already in workspace"
		}
	}

	idx, ok := runSelect("select repo", repos, hints)
	if !ok {
		return
	}
	selectedRepo := repos[idx]
	history = append(history, "repo: "+selectedRepo)

	dest := filepath.Join(wsDir, selectedRepo)
	repoPath := filepath.Join(source, selectedRepo)
	isNew := false

	if _, err := os.Stat(dest); err != nil {
		isNew = true

		printHistory(history)
		fmt.Println(gray.Render("checking " + selectedRepo + "..."))

		ok, msg := prepareRepo(repoPath)
		if !ok {
			fmt.Println(red.Render(selectedRepo + ": " + msg))
			return
		}
		history = append(history, selectedRepo+" checked")

		printHistory(history)
		fmt.Println(gray.Render("adding " + selectedRepo + "..."))

		if err := createWorktree(repoPath, dest, filepath.Base(wsDir)); err != nil {
			fmt.Println(red.Render(selectedRepo + ": " + git.ErrorMsg(err)))
			return
		}
	} else {
		dirs := findTopLevelDirs(repoPath)
		if len(dirs) == 0 {
			fmt.Println(red.Render(selectedRepo + " is already in workspace and has no subdirectories"))
			return
		}
	}
	_ = isNew

	dirs := findTopLevelDirs(repoPath)
	if len(dirs) == 0 {
		existing := readFocusDirs(wsDir)
		existing[selectedRepo] = []string{"*"}
		writeFocusConfig(wsDir, existing)
		printHistory(history)
		fmt.Println(green.Render(selectedRepo + " - focus: everything"))
		return
	}

	printHistory(history)
	options := append([]string{"everything"}, dirs...)
	values, ok := runMultiSelect(selectedRepo+": focus directories", options, true)
	if !ok {
		return
	}
	for i, v := range values {
		if v == "everything" {
			values[i] = "*"
		}
	}
	hasAll := false
	for _, v := range values {
		if v == "*" {
			hasAll = true
			break
		}
	}
	var focus []string
	if hasAll {
		focus = []string{"*"}
	} else {
		focus = values
	}

	existing := readFocusDirs(wsDir)
	existing[selectedRepo] = focus
	writeFocusConfig(wsDir, existing)

	printHistory(history)
	fmt.Println(green.Render(selectedRepo + " - focus: " + focusLabel(focus)))
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

func cmdDelete(source, wsDir string) {
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

	var dirtyRepos []string
	for _, repo := range repos {
		status := git.Run("status --porcelain", filepath.Join(wsDir, repo))
		if status != "" {
			dirtyRepos = append(dirtyRepos, repo)
		}
	}

	message := fmt.Sprintf("delete workspace %s? (%s)", filepath.Base(wsDir), strings.Join(repos, ", "))
	if len(dirtyRepos) > 0 {
		fmt.Println(yellow.Render("uncommitted changes in: " + strings.Join(dirtyRepos, ", ")))
		message = "uncommitted changes in: " + strings.Join(dirtyRepos, ", ") + ". delete anyway?"
	}

	yes, ok := runConfirm(message)
	if !ok || !yes {
		return
	}

	fmt.Println(gray.Render("deleting workspace..."))

	type result struct {
		repo string
		ok   bool
		msg  string
	}
	var results []result
	var failedRepos []string
	for _, repo := range repos {
		repoDir := filepath.Join(wsDir, repo)
		parentRepo := filepath.Join(source, repo)
		if _, err := os.Stat(filepath.Join(parentRepo, ".git")); err == nil {
			_, err := git.RunArgs([]string{"worktree", "remove", filepath.Join(wsDir, repo), "--force"}, parentRepo)
			if err != nil {
				failedRepos = append(failedRepos, repo)
			} else {
				results = append(results, result{repo, true, "removed"})
			}
		} else {
			os.RemoveAll(repoDir)
			results = append(results, result{repo, true, "removed"})
		}
	}

	if len(failedRepos) > 0 {
		fmt.Println()
		fmt.Println(yellow.Render("could not cleanly remove:"))
		for _, repo := range failedRepos {
			repoDir := filepath.Join(wsDir, repo)
			leftovers := listLeftovers(repoDir)
			fmt.Println(yellow.Render("  " + repo + ":"))
			for _, l := range leftovers {
				fmt.Println(yellow.Render("    " + l))
			}
		}
		fmt.Println()
		yes, ok := runConfirm("force remove these directories?")
		if !ok || !yes {
			fmt.Println(red.Render("aborted — workspace partially deleted"))
			for _, r := range results {
				fmt.Println(green.Render("-") + " " + r.repo + ": " + r.msg)
			}
			for _, repo := range failedRepos {
				fmt.Println(yellow.Render("!") + " " + repo + ": skipped")
			}
			return
		}
		for _, repo := range failedRepos {
			repoDir := filepath.Join(wsDir, repo)
			parentRepo := filepath.Join(source, repo)
			os.RemoveAll(repoDir)
			if _, err := os.Stat(filepath.Join(parentRepo, ".git")); err == nil {
				git.RunArgs([]string{"worktree", "prune"}, parentRepo)
			}
			results = append(results, result{repo, true, "force removed"})
		}
	}

	os.RemoveAll(wsDir)

	fmt.Println(bold.Render("delete complete"))
	for _, r := range results {
		if r.ok {
			fmt.Println(green.Render("-") + " " + r.repo + ": " + r.msg)
		} else {
			fmt.Println(red.Render("x") + " " + r.repo + ": " + r.msg)
		}
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
		if len(rest) == 1 {
			if preset, ok := presets[rest[0]]; ok {
				cmdCreate(preset.source, preset.target)
				return
			}
		}
		if len(rest) == 2 {
			source, _ := filepath.Abs(rest[0])
			target, _ := filepath.Abs(rest[1])
			cmdCreate(source, target)
			return
		}
		fmt.Fprintln(os.Stderr, "usage: ws create <preset> | ws create <source_dir> <target_dir>")
		fmt.Fprintf(os.Stderr, "presets: %s\n", presetNames())
		os.Exit(1)

	case "add":
		source, wsDir, ok := findWsDir()
		if !ok {
			fmt.Fprintln(os.Stderr, "not in a workspace directory (no .ws.json found)")
			os.Exit(1)
		}
		cmdAdd(source, wsDir)

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
		cmdDelete(cfg.Source, wsDir)

	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintln(os.Stderr, "usage: ws <command>")
	fmt.Fprintln(os.Stderr, "  ws create <preset>                  create workspace from preset")
	fmt.Fprintln(os.Stderr, "  ws create <source_dir> <target_dir>  create workspace")
	fmt.Fprintln(os.Stderr, "  ws add                              add repo (run from workspace dir)")
	fmt.Fprintln(os.Stderr, "  ws delete <workspace_dir>           delete a workspace")
	fmt.Fprintf(os.Stderr, "presets: %s\n", presetNames())
}

func presetNames() string {
	var names []string
	for k := range presets {
		names = append(names, k)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}
