package main

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
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

func workspaceTitleBarTheme() (activeBG, activeFG, inactiveBG, inactiveFG string) {
	themes := []struct {
		aB, aF, iB, iF string
	}{
		{"#4c6a8c", "#f2f4f8", "#3d5570", "#d8dce4"},
		{"#5c7a5c", "#f5faf3", "#4a634a", "#dce6dc"},
		{"#7a5c8c", "#faf5fc", "#634a70", "#e6dce8"},
		{"#8c6a4c", "#fffaf5", "#705540", "#e8e0dc"},
		{"#4c7a8c", "#f3fafc", "#3d6270", "#dce8ec"},
		{"#6a5c8c", "#f6f4fc", "#554a70", "#e2dce8"},
		{"#5c6a7a", "#f6f8fa", "#4a5563", "#dce0e6"},
		{"#7a6a4c", "#faf8f2", "#635540", "#e8e4dc"},
		{"#5b6e8a", "#f0f4fa", "#495a73", "#d4dae6"},
		{"#6b8a5b", "#f4faf0", "#567047", "#dae6d4"},
		{"#8a5b6e", "#faf0f4", "#704956", "#e6d4da"},
		{"#5e8a7a", "#f0faf7", "#4b7063", "#d4e6df"},
	}
	t := themes[rand.N(len(themes))]
	return t.aB, t.aF, t.iB, t.iF
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
	aB, aF, iB, iF := workspaceTitleBarTheme()
	wsName := filepath.Base(wsDir)
	wsData, _ := json.MarshalIndent(map[string]any{
		"folders": folders,
		"settings": map[string]any{
			"window.title":  wsName + " — ${rootName}${separator}${appName}",
			"files.exclude": map[string]any{"**/.git": true, ".ws.json": true},
			"workbench.colorCustomizations": map[string]any{
				"titleBar.activeBackground":   aB,
				"titleBar.activeForeground":   aF,
				"titleBar.inactiveBackground": iB,
				"titleBar.inactiveForeground": iF,
			},
		},
	}, "", "  ")
	os.WriteFile(filepath.Join(wsDir, filepath.Base(wsDir)+".code-workspace"), append(wsData, '\n'), 0644)
}

func workspaceCodeWorkspacePath(wsDir string) string {
	return filepath.Join(wsDir, filepath.Base(wsDir)+".code-workspace")
}

func applyRandomWorkspaceTitleBar(wsDir string) error {
	path := workspaceCodeWorkspacePath(wsDir)
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		return err
	}
	settings, _ := doc["settings"].(map[string]any)
	if settings == nil {
		settings = map[string]any{}
		doc["settings"] = settings
	}
	aB, aF, iB, iF := workspaceTitleBarTheme()
	ccNew := map[string]any{
		"titleBar.activeBackground":   aB,
		"titleBar.activeForeground":   aF,
		"titleBar.inactiveBackground": iB,
		"titleBar.inactiveForeground": iF,
	}
	existing, _ := settings["workbench.colorCustomizations"].(map[string]any)
	if existing == nil {
		settings["workbench.colorCustomizations"] = ccNew
	} else {
		for k, v := range ccNew {
			existing[k] = v
		}
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(out, '\n'), 0644)
}

func runColor() {
	_, wsDir, ok := findWsDir()
	if !ok {
		fmt.Fprintln(os.Stderr, "not in a workspace directory (no .ws.json found)")
		os.Exit(1)
	}
	if err := applyRandomWorkspaceTitleBar(wsDir); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
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
	final, err := tea.NewProgram(newAppCreate(source, workspaces, repos, useTmux)).Run()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if am, ok := final.(*appModel); ok && am.exitSummary != "" {
		fmt.Println(am.exitSummary)
	}
}

func workspaceRepoDirs(wsDir string) ([]string, error) {
	entries, err := os.ReadDir(wsDir)
	if err != nil {
		return nil, err
	}
	var repos []string
	for _, e := range entries {
		if !e.IsDir() || e.Name() == wsConfig {
			continue
		}
		repos = append(repos, e.Name())
	}
	sort.Strings(repos)
	return repos, nil
}

func removeOneWorktree(wsDir, source, repo string) error {
	repoDir := filepath.Join(wsDir, repo)
	parentRepo := filepath.Join(source, repo)
	if _, err := os.Stat(filepath.Join(parentRepo, ".git")); err == nil {
		_, err := git.RunArgs([]string{"worktree", "remove", repoDir, "--force"}, parentRepo)
		return err
	}
	return os.RemoveAll(repoDir)
}

func runAdd(source, wsDir string) {
	repos := findRepos(source)
	if len(repos) == 0 {
		fmt.Println(red.Render("no git repos found in " + source))
		return
	}
	final, err := tea.NewProgram(newAppAdd(source, wsDir, repos)).Run()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if am, ok := final.(*appModel); ok && am.exitSummary != "" {
		fmt.Println(am.exitSummary)
	}
}

func runRemove(source, wsDir string) {
	repos, err := workspaceRepoDirs(wsDir)
	if err != nil {
		fmt.Println(red.Render("cannot read workspace: " + err.Error()))
		return
	}
	if len(repos) == 0 {
		fmt.Println(red.Render("no repos in workspace"))
		return
	}
	var dirty []string
	for _, repo := range repos {
		if git.Run("status --porcelain", filepath.Join(wsDir, repo)) != "" {
			dirty = append(dirty, repo)
		}
	}
	sort.Strings(dirty)
	if _, err := tea.NewProgram(newAppRemove(source, wsDir, repos, dirty)).Run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runDelete(source, wsDir string) {
	repos, err := workspaceRepoDirs(wsDir)
	if err != nil {
		fmt.Println(red.Render("cannot read workspace: " + err.Error()))
		return
	}
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

	case "remove":
		source, wsDir, ok := findWsDir()
		if !ok {
			fmt.Fprintln(os.Stderr, "not in a workspace directory (no .ws.json found)")
			os.Exit(1)
		}
		runRemove(source, wsDir)

	case "color":
		if len(rest) != 0 {
			fmt.Fprintln(os.Stderr, "usage: ws color")
			os.Exit(1)
		}
		runColor()

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
		cyan.Render("remove")+gray.Render("   ws remove")+magenta.Render(" · ")+gray.Render("from inside a workspace"),
		cyan.Render("color")+gray.Render("    ws color")+magenta.Render(" · ")+gray.Render("random title bar theme in .code-workspace"),
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
