package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"dotfiles/tools/internal/git"

	"charm.land/bubbles/v2/key"
	bspin "charm.land/bubbles/v2/spinner"
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
)

type evtStatus struct {
	phase  string
	detail string
}

type evtDone struct {
	err error
}

type chanMsg struct {
	ev interface{}
}

type pollTickMsg struct{}

func pollWorkChan(ch chan interface{}) tea.Cmd {
	return tea.Tick(20*time.Millisecond, func(time.Time) tea.Msg {
		select {
		case ev := <-ch:
			return chanMsg{ev: ev}
		default:
			return pollTickMsg{}
		}
	})
}

type appMode int

const (
	modeNone appMode = iota
	modeCreate
	modeAdd
	modeDelete
)

type stepKind int

const (
	skNone stepKind = iota
	skCreatePickRepos
	skCreateChecking
	skCreateCheckFailed
	skCreateName
	skCreateFocus
	skCreateBuilding
	skCreateSummary
	skAddPick
	skAddChecking
	skAddBuilding
	skAddFocus
	skAddSummary
	skDeleteConfirm
	skDeleteWork
	skDeleteForceConfirm
	skDeleteForceWork
	skDeleteSummary
)

type wtreeResult struct {
	repo string
	ok   bool
	msg  string
}

type appModel struct {
	mode   appMode
	step   stepKind
	source string

	workspaces string
	wsDir      string
	repos      []string
	history    []string
	selected   []string
	focus      focusMap
	focusQueue []string
	wsName     string

	multi multiSelectModel
	sel   selectModel
	cfm   confirmModel

	wsNameForm  *huh.Form
	wsNameDraft string

	sp           bspin.Model
	workCh       chan interface{}
	asyncTitle   string
	workPhase    string
	workDetail   string
	workErr      error
	issues       []string
	results      []wtreeResult
	summaryLines []string

	createTmux bool

	addRepo     string
	addHints    []string
	addIsNew    bool
	addDest     string
	addRepoPath string

	delRepos       []string
	delDirty       []string
	delMsg         string
	delResults     []wtreeResult
	delFailed      []string
	forceShowLines []string
}

func newAppCreate(source, workspaces string, repos []string, createTmux bool) *appModel {
	return &appModel{
		mode:       modeCreate,
		step:       skCreatePickRepos,
		source:     source,
		workspaces: workspaces,
		repos:      repos,
		createTmux: createTmux,
		multi:      newMultiSelect("select repos", repos, false),
		focus:      make(focusMap),
	}
}

func newAppAdd(source, wsDir string, repos []string, hints []string) *appModel {
	return &appModel{
		mode:     modeAdd,
		step:     skAddPick,
		source:   source,
		wsDir:    wsDir,
		repos:    repos,
		addHints: hints,
		sel:      newSelect("select repo", repos, hints),
	}
}

func newAppDelete(source, wsDir string, repos, dirty []string, confirmMsg string) *appModel {
	return &appModel{
		mode:       modeDelete,
		step:       skDeleteConfirm,
		source:     source,
		wsDir:      wsDir,
		delRepos:   repos,
		delDirty:   dirty,
		delMsg:     confirmMsg,
		cfm:        newConfirm(confirmMsg),
		delResults: nil,
		delFailed:  nil,
	}
}

func (m *appModel) newWorkspaceNameForm() *huh.Form {
	km := huh.NewDefaultKeyMap()
	km.Quit = key.NewBinding(key.WithKeys("esc", "ctrl+c"))
	return huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Key("wsname").
				Title("Workspace name").
				Value(&m.wsNameDraft).
				Validate(func(s string) error {
					if strings.TrimSpace(s) == "" {
						return errors.New("required")
					}
					return nil
				}),
		),
	).WithKeyMap(km)
}

func (m *appModel) Init() tea.Cmd {
	return nil
}

func (m *appModel) bannerLines(action, subtitle string) []string {
	lines := []string{titleBar.Render("ws") + "  " + cyan.Render(action)}
	if subtitle != "" {
		lines = append(lines, gray.Render(subtitle))
	}
	return lines
}

func (m *appModel) historyBlock() string {
	if len(m.history) == 0 {
		return ""
	}
	rows := make([]string, len(m.history))
	for i, e := range m.history {
		rows[i] = gray.Render(e)
	}
	return historyPanel.Render(lipgloss.JoinVertical(lipgloss.Left, rows...)) + "\n"
}

func (m *appModel) asyncBlock() string {
	head := lipgloss.JoinHorizontal(lipgloss.Left, m.sp.View(), " ", bold.Render(m.asyncTitle))
	nowLbl := magenta.Render("now ") + cyan.Render(m.workPhase)
	detail := lipgloss.NewStyle().Foreground(lipgloss.Color("247")).Render(m.workDetail)
	return statusPanel.Render(lipgloss.JoinVertical(lipgloss.Left, head, "", nowLbl, detail)) + "\n"
}

func (m *appModel) inAsync() bool {
	switch m.step {
	case skCreateChecking, skCreateBuilding, skAddChecking, skAddBuilding, skDeleteWork, skDeleteForceWork:
		return true
	}
	return false
}

func (m *appModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.inAsync() {
		return m.updateAsync(msg)
	}
	switch m.mode {
	case modeCreate:
		return m.updateCreate(msg)
	case modeAdd:
		return m.updateAdd(msg)
	case modeDelete:
		return m.updateDelete(msg)
	}
	return m, nil
}

func (m *appModel) updateAsync(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}
	case chanMsg:
		switch ev := msg.ev.(type) {
		case evtStatus:
			m.workPhase = ev.phase
			m.workDetail = ev.detail
		case evtDone:
			m.workErr = ev.err
			m.workCh = nil
			return m, m.afterAsyncDone()
		}
		return m, pollWorkChan(m.workCh)
	case pollTickMsg:
		return m, pollWorkChan(m.workCh)
	case bspin.TickMsg:
		var cmd tea.Cmd
		m.sp, cmd = m.sp.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m *appModel) beginSpinner(title string) {
	m.asyncTitle = title
	m.workPhase = "…"
	m.workDetail = "starting"
	m.sp = bspin.New(
		bspin.WithSpinner(bspin.MiniDot),
		bspin.WithStyle(lipgloss.NewStyle().Foreground(lipgloss.Color("6"))),
	)
}

func (m *appModel) beginCheckRepos() tea.Cmd {
	m.beginSpinner("checking repositories")
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	source := m.source
	selected := m.selected
	issuesMu := struct{ s *[]string }{s: &m.issues}
	go func() {
		n := len(selected)
		for i, repo := range selected {
			ch <- evtStatus{
				phase:  "verify repository",
				detail: fmt.Sprintf("[%d/%d]  %s  ·  default branch · pull · clean tree", i+1, n, repo),
			}
			ok, msg := prepareRepo(filepath.Join(source, repo))
			if !ok {
				*issuesMu.s = append(*issuesMu.s, repo+": "+msg)
			}
		}
		ch <- evtDone{err: nil}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) beginCreateBuild() tea.Cmd {
	m.beginSpinner("creating workspace")
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	wsDir := filepath.Join(m.workspaces, m.wsName)
	source := m.source
	selected := m.selected
	focus := m.focus
	wsName := m.wsName
	resultsHolder := &m.results
	go func() {
		var results []wtreeResult
		ch <- evtStatus{phase: "layout", detail: "mkdir  " + wsDir}
		os.MkdirAll(wsDir, 0755)
		ch <- evtStatus{phase: "config", detail: "write  " + wsConfig + "  ·  source → " + source}
		writeWsConfig(wsDir, source)
		claudeMd := filepath.Join(source, "CLAUDE.md")
		if _, err := os.Stat(claudeMd); err == nil {
			ch <- evtStatus{phase: "symlinks", detail: "CLAUDE.md  →  " + filepath.Join(wsDir, "CLAUDE.md")}
			os.Symlink(claudeMd, filepath.Join(wsDir, "CLAUDE.md"))
		}
		ch <- evtStatus{phase: "symlinks", detail: ".me / .claude  (when present in source)"}
		for _, dir := range symlinkDirs {
			src := filepath.Join(source, dir)
			dst := filepath.Join(wsDir, dir)
			if _, err := os.Stat(src); err == nil {
				if _, err := os.Lstat(dst); err != nil {
					os.Symlink(src, dst)
				}
			}
		}
		n := len(selected)
		for i, repo := range selected {
			ch <- evtStatus{phase: "git worktrees", detail: fmt.Sprintf("[%d/%d]  worktree add  ·  %s", i+1, n, repo)}
			err := createWorktree(filepath.Join(source, repo), filepath.Join(wsDir, repo), wsName)
			if err != nil {
				results = append(results, wtreeResult{repo: repo, ok: false, msg: git.ErrorMsg(err)})
			} else {
				results = append(results, wtreeResult{repo: repo, ok: true, msg: "focus: " + focusLabel(focus[repo])})
			}
		}
		ch <- evtStatus{phase: "focus & workspace file", detail: "CLAUDE.local.md  ·  " + filepath.Base(wsDir) + ".code-workspace"}
		writeFocusConfig(wsDir, focus)
		*resultsHolder = results
		ch <- evtDone{err: nil}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) afterAsyncDone() tea.Cmd {
	switch m.step {
	case skCreateChecking:
		if m.workErr != nil {
			return tea.Quit
		}
		if len(m.issues) > 0 {
			m.step = skCreateCheckFailed
			return nil
		}
		m.history = append(m.history, "repos checked")
		m.step = skCreateName
		m.wsNameDraft = ""
		m.wsNameForm = m.newWorkspaceNameForm()
		return m.wsNameForm.Init()
	case skCreateBuilding:
		if m.workErr != nil {
			return tea.Quit
		}
		m.buildCreateSummary()
		m.step = skCreateSummary
		return nil
	case skAddChecking:
		if m.workErr != nil {
			return tea.Quit
		}
		m.history = append(m.history, m.addRepo+" checked")
		m.step = skAddBuilding
		return m.beginAddBuild()
	case skAddBuilding:
		if m.workErr != nil {
			return tea.Quit
		}
		m.finishAddAfterBuild()
		return nil
	case skDeleteWork:
		if m.workErr != nil {
			return tea.Quit
		}
		if len(m.delFailed) > 0 {
			m.buildForceShow()
			m.step = skDeleteForceConfirm
			return nil
		}
		return m.finishDeleteDirs()
	case skDeleteForceWork:
		if m.workErr != nil {
			return tea.Quit
		}
		return m.finishDeleteDirs()
	}
	return nil
}

func (m *appModel) buildCreateSummary() {
	wsDir := filepath.Join(m.workspaces, m.wsName)
	m.summaryLines = nil
	m.summaryLines = append(m.summaryLines, bold.Render("workspace ready"))
	m.summaryLines = append(m.summaryLines, cyan.Render(wsDir))
	m.summaryLines = append(m.summaryLines, "")
	for _, r := range m.results {
		if r.ok {
			m.summaryLines = append(m.summaryLines, green.Render("✓ ")+r.repo+magenta.Render(" → ")+gray.Render(r.msg))
		} else {
			m.summaryLines = append(m.summaryLines, red.Render("✗ ")+r.repo+magenta.Render(" → ")+red.Render(r.msg))
		}
	}
	if m.createTmux && os.Getenv("TMUX") != "" {
		exec.Command("tmux", "new-window", "-c", wsDir, "-n", m.wsName).Run()
		m.summaryLines = append(m.summaryLines, "")
		m.summaryLines = append(m.summaryLines, green.Render("tmux ")+gray.Render("new window ")+cyan.Render(m.wsName))
	} else {
		m.summaryLines = append(m.summaryLines, "")
		m.summaryLines = append(m.summaryLines, gray.Render("cd ")+cyan.Render(wsDir))
	}
}

func (m *appModel) advanceCreatePickDone() (tea.Model, tea.Cmd) {
	vals := m.multi.Values()
	if len(vals) == 0 {
		return m, nil
	}
	sort.Strings(vals)
	m.selected = vals
	m.history = append(m.history, "repos: "+strings.Join(vals, ", "))
	m.step = skCreateChecking
	m.issues = nil
	return m, m.beginCheckRepos()
}

func (m *appModel) updateCreate(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skCreatePickRepos:
		if k, ok := msg.(tea.KeyPressMsg); ok {
			nm, cmd := m.multi.Update(k)
			m.multi = nm.(multiSelectModel)
			if m.multi.cancelled {
				return m, tea.Quit
			}
			if m.multi.done {
				return m.advanceCreatePickDone()
			}
			return m, cmd
		}
	case skCreateCheckFailed:
		if _, ok := msg.(tea.KeyPressMsg); ok {
			return m, tea.Quit
		}
	case skCreateName:
		if m.wsNameForm == nil {
			m.wsNameDraft = ""
			m.wsNameForm = m.newWorkspaceNameForm()
			return m, m.wsNameForm.Init()
		}
		next, cmd := m.wsNameForm.Update(msg)
		if f, ok := next.(*huh.Form); ok {
			m.wsNameForm = f
		}
		switch m.wsNameForm.State {
		case huh.StateAborted:
			return m, tea.Quit
		case huh.StateCompleted:
			m.wsName = strings.TrimSpace(m.wsNameDraft)
			m.wsNameForm = nil
			m.history = append(m.history, "name: "+m.wsName)
			m.focusQueue = nil
			for _, repo := range m.selected {
				repoPath := filepath.Join(m.source, repo)
				dirs := findTopLevelDirs(repoPath)
				if len(dirs) == 0 {
					m.focus[repo] = []string{"*"}
					m.history = append(m.history, repo+": everything")
				} else {
					m.focusQueue = append(m.focusQueue, repo)
				}
			}
			if len(m.focusQueue) == 0 {
				m.step = skCreateBuilding
				return m, m.beginCreateBuild()
			}
			repo := m.focusQueue[0]
			opts := append([]string{"everything"}, findTopLevelDirs(filepath.Join(m.source, repo))...)
			m.multi = newMultiSelect(repo+": focus directories", opts, true)
			m.step = skCreateFocus
			return m, nil
		}
		return m, cmd
	case skCreateFocus:
		if k, ok := msg.(tea.KeyPressMsg); ok {
			nm, cmd := m.multi.Update(k)
			m.multi = nm.(multiSelectModel)
			if m.multi.cancelled {
				return m, tea.Quit
			}
			if m.multi.done {
				repo := m.focusQueue[0]
				vals := m.multi.Values()
				for i, v := range vals {
					if v == "everything" {
						vals[i] = "*"
					}
				}
				hasAll := false
				for _, v := range vals {
					if v == "*" {
						hasAll = true
						break
					}
				}
				if hasAll {
					m.focus[repo] = []string{"*"}
				} else {
					m.focus[repo] = vals
				}
				m.history = append(m.history, repo+": "+focusLabel(m.focus[repo]))
				m.focusQueue = m.focusQueue[1:]
				if len(m.focusQueue) == 0 {
					m.step = skCreateBuilding
					return m, m.beginCreateBuild()
				}
				nextRepo := m.focusQueue[0]
				opts := append([]string{"everything"}, findTopLevelDirs(filepath.Join(m.source, nextRepo))...)
				m.multi = newMultiSelect(nextRepo+": focus directories", opts, true)
				return m, nil
			}
			return m, cmd
		}
	case skCreateSummary:
		if k, ok := msg.(tea.KeyPressMsg); ok && k.String() == "enter" {
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *appModel) beginAddCheck() tea.Cmd {
	m.beginSpinner("checking " + m.addRepo)
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	repoPath := m.addRepoPath
	var prepErr error
	go func() {
		ch <- evtStatus{phase: "prepare", detail: "default branch · pull --rebase · clean working tree"}
		ok, msg := prepareRepo(repoPath)
		if !ok {
			prepErr = fmt.Errorf("%s: %s", m.addRepo, msg)
		}
		ch <- evtDone{err: prepErr}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) beginAddBuild() tea.Cmd {
	m.beginSpinner("adding " + m.addRepo)
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	repoPath := m.addRepoPath
	dest := m.addDest
	wsBranch := filepath.Base(m.wsDir)
	var buildErr error
	go func() {
		ch <- evtStatus{phase: "git worktree", detail: "add  ·  branch " + wsBranch + "  ·  " + m.addRepo}
		buildErr = createWorktree(repoPath, dest, wsBranch)
		ch <- evtDone{err: buildErr}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) finishAddAfterBuild() {
	repoPath := filepath.Join(m.source, m.addRepo)
	dirs := findTopLevelDirs(repoPath)
	if len(dirs) == 0 {
		existing := readFocusDirs(m.wsDir)
		existing[m.addRepo] = []string{"*"}
		writeFocusConfig(m.wsDir, existing)
		m.history = append(m.history, m.addRepo+" - focus: everything")
		m.summaryLines = []string{bold.Render(m.addRepo), green.Render("focus: everything")}
		m.step = skAddSummary
		return
	}
	opts := append([]string{"everything"}, dirs...)
	m.multi = newMultiSelect(m.addRepo+": focus directories", opts, true)
	m.step = skAddFocus
}

func (m *appModel) updateAdd(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skAddPick:
		if k, ok := msg.(tea.KeyPressMsg); ok {
			nm, cmd := m.sel.Update(k)
			m.sel = nm.(selectModel)
			if m.sel.cancelled {
				return m, tea.Quit
			}
			if m.sel.done {
				m.addRepo = m.repos[m.sel.cursor]
				m.history = append(m.history, "repo: "+m.addRepo)
				m.addDest = filepath.Join(m.wsDir, m.addRepo)
				m.addRepoPath = filepath.Join(m.source, m.addRepo)
				if _, err := os.Stat(m.addDest); err != nil {
					m.step = skAddChecking
					return m, m.beginAddCheck()
				}
				dirs := findTopLevelDirs(m.addRepoPath)
				if len(dirs) == 0 {
					m.summaryLines = []string{red.Render(m.addRepo + " is already in workspace and has no subdirectories")}
					m.step = skAddSummary
					return m, nil
				}
				opts := append([]string{"everything"}, dirs...)
				m.multi = newMultiSelect(m.addRepo+": focus directories", opts, true)
				m.step = skAddFocus
				return m, nil
			}
			return m, cmd
		}
	case skAddFocus:
		if k, ok := msg.(tea.KeyPressMsg); ok {
			nm, cmd := m.multi.Update(k)
			m.multi = nm.(multiSelectModel)
			if m.multi.cancelled {
				return m, tea.Quit
			}
			if m.multi.done {
				vals := m.multi.Values()
				for i, v := range vals {
					if v == "everything" {
						vals[i] = "*"
					}
				}
				hasAll := false
				for _, v := range vals {
					if v == "*" {
						hasAll = true
						break
					}
				}
				var focus []string
				if hasAll {
					focus = []string{"*"}
				} else {
					focus = vals
				}
				existing := readFocusDirs(m.wsDir)
				existing[m.addRepo] = focus
				writeFocusConfig(m.wsDir, existing)
				m.history = append(m.history, m.addRepo+" - focus: "+focusLabel(focus))
				m.summaryLines = []string{bold.Render(m.addRepo), green.Render("focus: " + focusLabel(focus))}
				m.step = skAddSummary
				return m, nil
			}
			return m, cmd
		}
	case skAddSummary:
		if k, ok := msg.(tea.KeyPressMsg); ok && k.String() == "enter" {
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *appModel) beginDeleteWork() tea.Cmd {
	m.beginSpinner("removing worktrees")
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	wsDir := m.wsDir
	source := m.source
	repos := append([]string(nil), m.delRepos...)
	resHolder := &m.delResults
	failHolder := &m.delFailed
	go func() {
		var results []wtreeResult
		var failed []string
		for _, repo := range repos {
			ch <- evtStatus{phase: "git worktree remove --force", detail: repo}
			repoDir := filepath.Join(wsDir, repo)
			parentRepo := filepath.Join(source, repo)
			if _, err := os.Stat(filepath.Join(parentRepo, ".git")); err == nil {
				_, err := git.RunArgs([]string{"worktree", "remove", filepath.Join(wsDir, repo), "--force"}, parentRepo)
				if err != nil {
					failed = append(failed, repo)
				} else {
					results = append(results, wtreeResult{repo: repo, ok: true, msg: "removed"})
				}
			} else {
				os.RemoveAll(repoDir)
				results = append(results, wtreeResult{repo: repo, ok: true, msg: "removed"})
			}
		}
		*resHolder = results
		*failHolder = failed
		ch <- evtDone{err: nil}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) beginDeleteForce() tea.Cmd {
	m.beginSpinner("force removing leftovers")
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	wsDir := m.wsDir
	source := m.source
	failed := append([]string(nil), m.delFailed...)
	resHolder := &m.delResults
	go func() {
		for _, repo := range failed {
			ch <- evtStatus{phase: "rm + git worktree prune", detail: repo}
			repoDir := filepath.Join(wsDir, repo)
			parentRepo := filepath.Join(source, repo)
			os.RemoveAll(repoDir)
			if _, err := os.Stat(filepath.Join(parentRepo, ".git")); err == nil {
				git.RunArgs([]string{"worktree", "prune"}, parentRepo)
			}
			*resHolder = append(*resHolder, wtreeResult{repo: repo, ok: true, msg: "force removed"})
		}
		ch <- evtDone{err: nil}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) buildForceShow() {
	var lines []string
	lines = append(lines, yellow.Render("could not cleanly remove:"))
	for _, repo := range m.delFailed {
		lines = append(lines, yellow.Render("  "+repo+":"))
		for _, l := range listLeftovers(filepath.Join(m.wsDir, repo)) {
			lines = append(lines, yellow.Render("    "+l))
		}
	}
	m.forceShowLines = lines
	m.cfm = newConfirm("force remove these directories?")
}

func (m *appModel) finishDeleteDirs() tea.Cmd {
	os.RemoveAll(m.wsDir)
	var lines []string
	lines = append(lines, bold.Render("delete complete"))
	lines = append(lines, "")
	for _, r := range m.delResults {
		if r.ok {
			lines = append(lines, green.Render("✓ ")+r.repo+gray.Render(" · ")+r.msg)
		} else {
			lines = append(lines, red.Render("✗ ")+r.repo+gray.Render(" · ")+r.msg)
		}
	}
	m.summaryLines = lines
	m.step = skDeleteSummary
	return nil
}

func (m *appModel) updateDelete(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skDeleteConfirm:
		if k, ok := msg.(tea.KeyPressMsg); ok {
			nm, cmd := m.cfm.Update(k)
			m.cfm = nm.(confirmModel)
			if m.cfm.cancelled {
				return m, tea.Quit
			}
			if m.cfm.done {
				if !m.cfm.result {
					return m, tea.Quit
				}
				m.step = skDeleteWork
				return m, m.beginDeleteWork()
			}
			return m, cmd
		}
	case skDeleteForceConfirm:
		if k, ok := msg.(tea.KeyPressMsg); ok {
			nm, cmd := m.cfm.Update(k)
			m.cfm = nm.(confirmModel)
			if m.cfm.cancelled {
				return m, tea.Quit
			}
			if m.cfm.done {
				if !m.cfm.result {
					var lines []string
					lines = append(lines, red.Render("aborted — workspace partially deleted"))
					for _, r := range m.delResults {
						lines = append(lines, green.Render("✓ ")+r.repo+gray.Render(" · ")+r.msg)
					}
					for _, repo := range m.delFailed {
						lines = append(lines, yellow.Render("! ")+repo+gray.Render(" · skipped"))
					}
					m.summaryLines = lines
					m.step = skDeleteSummary
					return m, nil
				}
				m.step = skDeleteForceWork
				return m, m.beginDeleteForce()
			}
			return m, cmd
		}
	case skDeleteSummary:
		if k, ok := msg.(tea.KeyPressMsg); ok && k.String() == "enter" {
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *appModel) View() tea.View {
	if m.inAsync() {
		var b strings.Builder
		switch m.mode {
		case modeCreate:
			b.WriteString(panel.Render(lipgloss.JoinVertical(lipgloss.Left, m.bannerLines("create workspace", m.workspaces)...)) + "\n")
			b.WriteString(m.historyBlock())
		case modeAdd:
			b.WriteString(panel.Render(lipgloss.JoinVertical(lipgloss.Left, m.bannerLines("add repository", m.wsDir)...)) + "\n")
			b.WriteString(m.historyBlock())
		case modeDelete:
			b.WriteString(panel.Render(lipgloss.JoinVertical(lipgloss.Left, m.bannerLines("delete workspace", filepath.Base(m.wsDir))...)) + "\n")
		}
		b.WriteString(m.asyncBlock())
		return tea.NewView(b.String())
	}
	var b strings.Builder
	switch m.mode {
	case modeCreate:
		b.WriteString(panel.Render(lipgloss.JoinVertical(lipgloss.Left, m.bannerLines("create workspace", m.workspaces)...)) + "\n")
		b.WriteString(m.historyBlock())
		switch m.step {
		case skCreatePickRepos, skCreateFocus:
			b.WriteString(m.multi.View().Content)
		case skCreateCheckFailed:
			for _, i := range m.issues {
				b.WriteString(red.Render(i) + "\n")
			}
			b.WriteString(red.Render("fix the issues above and try again") + "\n")
			b.WriteString(gray.Render("any key · exit") + "\n")
		case skCreateName:
			if m.wsNameForm != nil {
				b.WriteString(m.wsNameForm.View())
			}
		case skCreateSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	case modeAdd:
		b.WriteString(panel.Render(lipgloss.JoinVertical(lipgloss.Left, m.bannerLines("add repository", m.wsDir)...)) + "\n")
		b.WriteString(m.historyBlock())
		switch m.step {
		case skAddPick:
			b.WriteString(m.sel.View().Content)
		case skAddFocus:
			b.WriteString(m.multi.View().Content)
		case skAddSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	case modeDelete:
		b.WriteString(panel.Render(lipgloss.JoinVertical(lipgloss.Left, m.bannerLines("delete workspace", filepath.Base(m.wsDir))...)) + "\n")
		switch m.step {
		case skDeleteConfirm:
			if len(m.delDirty) > 0 {
				b.WriteString(yellow.Render("uncommitted changes in: "+strings.Join(m.delDirty, ", ")) + "\n\n")
			}
			tail := m.cfm.View().Content
			if !strings.HasSuffix(tail, "\n") {
				tail += "\n"
			}
			b.WriteString(tail)
		case skDeleteForceConfirm:
			for _, ln := range m.forceShowLines {
				b.WriteString(ln + "\n")
			}
			b.WriteString("\n")
			tail := m.cfm.View().Content
			if !strings.HasSuffix(tail, "\n") {
				tail += "\n"
			}
			b.WriteString(tail)
		case skDeleteSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	}
	return tea.NewView(b.String())
}
