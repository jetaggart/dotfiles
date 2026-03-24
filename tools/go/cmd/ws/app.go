package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
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
	modeRemove
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
	skAddPickRepos
	skAddChecking
	skAddCheckFailed
	skAddBuilding
	skAddFocus
	skAddSummary
	skRemovePick
	skRemoveConfirm
	skRemoveWork
	skRemoveSummary
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

	termH int
	termW int

	workspaces string
	wsDir      string
	repos      []string
	history    []string
	selected   []string
	focus      focusMap
	focusQueue []string
	wsName     string

	form *huh.Form

	wsNameDraft string
	pickRepos   []string
	focusPick   []string
	delYes      bool

	sp           bspin.Model
	workCh       chan interface{}
	asyncTitle   string
	workPhase    string
	workDetail   string
	workErr      error
	issues       []string
	results      []wtreeResult
	summaryLines []string
	exitSummary  string

	createTmux bool

	removeRepos  []string
	removeDirty  []string
	removePick   string
	removeTarget string

	delRepos       []string
	delDirty       []string
	delMsg         string
	delResults     []wtreeResult
	delFailed      []string
	forceShowLines []string
}

func newAppCreate(source, workspaces string, repos []string, createTmux bool) *appModel {
	m := &appModel{
		mode:       modeCreate,
		step:       skCreatePickRepos,
		source:     source,
		workspaces: workspaces,
		repos:      repos,
		createTmux: createTmux,
		focus:      make(focusMap),
	}
	m.form = m.newReposPickForm()
	m.layoutForm(m.form)
	return m
}

func newAppAdd(source, wsDir string, repos []string) *appModel {
	m := &appModel{
		mode:   modeAdd,
		step:   skAddPickRepos,
		source: source,
		wsDir:  wsDir,
		repos:  repos,
		focus:  make(focusMap),
	}
	m.form = m.newReposPickForm()
	m.layoutForm(m.form)
	return m
}

func newAppRemove(source, wsDir string, repos, dirty []string) *appModel {
	m := &appModel{
		mode:        modeRemove,
		step:        skRemovePick,
		source:      source,
		wsDir:       wsDir,
		removeRepos: append([]string(nil), repos...),
		removeDirty: append([]string(nil), dirty...),
	}
	m.form = m.newRemovePickForm()
	m.layoutForm(m.form)
	return m
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
		delResults: nil,
		delFailed:  nil,
	}
}

func (m *appModel) huhQuitKeyMap() *huh.KeyMap {
	km := huh.NewDefaultKeyMap()
	km.Quit = key.NewBinding(key.WithKeys("esc", "ctrl+c"))
	return km
}

func (m *appModel) outerHeaderHeight() int {
	var sb strings.Builder
	switch m.mode {
	case modeCreate:
		sb.WriteString(m.bannerLine("create workspace", m.workspaces))
		sb.WriteString(m.historyLine())
	case modeAdd:
		sb.WriteString(m.bannerLine("add repositories", m.wsDir))
		sb.WriteString(m.historyLine())
	case modeRemove:
		sb.WriteString(m.bannerLine("remove repository", m.wsDir))
		sb.WriteString(m.historyLine())
	case modeDelete:
		sb.WriteString(m.bannerLine("delete workspace", filepath.Base(m.wsDir)))
		if m.step == skDeleteConfirm && len(m.delDirty) > 0 {
			sb.WriteString(yellow.Render("uncommitted changes in: "+strings.Join(m.delDirty, ", ")) + "\n\n")
		}
		if m.step == skDeleteForceConfirm {
			for _, ln := range m.forceShowLines {
				sb.WriteString(ln + "\n")
			}
			sb.WriteString("\n")
		}
	}
	return lipgloss.Height(sb.String())
}

func (m *appModel) formLayoutSize() (w, h int) {
	w = m.termW
	if w <= 0 {
		w = 80
	}
	th := m.termH
	if th <= 0 {
		th = 24
	}
	hh := m.outerHeaderHeight()
	h = th - hh
	if h < 8 {
		h = 8
	}
	return w, h
}

func (m *appModel) layoutForm(f *huh.Form) {
	if f == nil {
		return
	}
	w, h := m.formLayoutSize()
	f.WithWidth(w).WithHeight(h)
}

func (m *appModel) huhFieldHeight() int {
	_, h := m.formLayoutSize()
	return max(h-4, 6)
}

func (m *appModel) newReposPickForm() *huh.Form {
	m.pickRepos = nil
	opts := huh.NewOptions(m.repos...)
	w, _ := m.formLayoutSize()
	fh := m.huhFieldHeight()
	ms := huh.NewMultiSelect[string]().
		Key("repos").
		Title("select repos").
		Options(opts...).
		Value(&m.pickRepos).
		Filterable(false).
		Height(fh).
		Width(w).
		Validate(func(v []string) error {
			if len(v) == 0 {
				return errors.New("select at least one repo")
			}
			return nil
		})
	return huh.NewForm(huh.NewGroup(ms)).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) newFocusPickForm(title string, optionStrs []string) *huh.Form {
	m.focusPick = nil
	opts := huh.NewOptions(optionStrs...)
	w, _ := m.formLayoutSize()
	fh := m.huhFieldHeight()
	ms := huh.NewMultiSelect[string]().
		Key("focus").
		Title(title).
		Options(opts...).
		Value(&m.focusPick).
		Filterable(false).
		Height(fh).
		Width(w).
		Validate(func(vals []string) error {
			if len(vals) == 0 {
				return errors.New("select at least one")
			}
			if slices.Contains(vals, "everything") && len(vals) > 1 {
				return errors.New("everything excludes other directories")
			}
			return nil
		})
	return huh.NewForm(huh.NewGroup(ms)).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) newWorkspaceNameForm() *huh.Form {
	m.wsNameDraft = ""
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
	).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) newDeleteConfirmForm() *huh.Form {
	m.delYes = false
	return huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Key("del").
				Title(m.delMsg).
				Affirmative("Yes").
				Negative("No").
				Value(&m.delYes),
		),
	).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) newForceDeleteConfirmForm() *huh.Form {
	m.delYes = false
	return huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Key("force").
				Title("force remove these directories?").
				Affirmative("Yes").
				Negative("No").
				Value(&m.delYes),
		),
	).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) newRemovePickForm() *huh.Form {
	var opts []huh.Option[string]
	for _, r := range m.removeRepos {
		label := r
		if slices.Contains(m.removeDirty, r) {
			label = r + "  " + yellow.Render("uncommitted")
		}
		opts = append(opts, huh.NewOption(label, r))
	}
	m.removePick = m.removeRepos[0]
	fh := m.huhFieldHeight()
	sel := huh.NewSelect[string]().
		Key("rmpick").
		Title("repository to remove").
		Options(opts...).
		Value(&m.removePick).
		Height(fh)
	return huh.NewForm(huh.NewGroup(sel)).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) newRemoveConfirmForm() *huh.Form {
	m.delYes = false
	return huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Key("rmok").
				Title(fmt.Sprintf("Remove %s from workspace?", m.removeTarget)).
				Affirmative("Yes").
				Negative("No").
				Value(&m.delYes),
		),
	).WithKeyMap(m.huhQuitKeyMap())
}

func (m *appModel) forwardHuh(msg tea.Msg, onDone func() (tea.Model, tea.Cmd)) (tea.Model, tea.Cmd) {
	next, cmd := m.form.Update(msg)
	if f, ok := next.(*huh.Form); ok {
		m.form = f
	}
	switch m.form.State {
	case huh.StateAborted:
		return m, tea.Quit
	case huh.StateCompleted:
		return onDone()
	}
	return m, cmd
}

func (m *appModel) Init() tea.Cmd {
	if m.form != nil {
		return m.form.Init()
	}
	return nil
}

func (m *appModel) viewAlt(content string) tea.View {
	v := tea.NewView(content)
	v.AltScreen = true
	return v
}

func (m *appModel) bannerLine(action, subtitle string) string {
	line := titleBar.Render("ws") + " " + cyan.Render(action)
	if subtitle != "" {
		line += gray.Render("  " + subtitle)
	}
	return line + "\n"
}

func (m *appModel) historyLine() string {
	if len(m.history) == 0 {
		return ""
	}
	return gray.Render(strings.Join(m.history, " · ")) + "\n"
}

func (m *appModel) asyncBlock() string {
	head := lipgloss.JoinHorizontal(lipgloss.Left, m.sp.View(), " ", bold.Render(m.asyncTitle))
	nowLbl := magenta.Render("now ") + cyan.Render(m.workPhase)
	detail := lipgloss.NewStyle().Foreground(lipgloss.Color("247")).Render(m.workDetail)
	return statusPanel.Render(lipgloss.JoinVertical(lipgloss.Left, head, "", nowLbl, detail)) + "\n"
}

func (m *appModel) inAsync() bool {
	switch m.step {
	case skCreateChecking, skCreateBuilding, skAddChecking, skAddBuilding, skRemoveWork, skDeleteWork, skDeleteForceWork:
		return true
	}
	return false
}

func (m *appModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if ws, ok := msg.(tea.WindowSizeMsg); ok {
		m.termW = ws.Width
		m.termH = ws.Height
		m.layoutForm(m.form)
	}
	if m.inAsync() {
		return m.updateAsync(msg)
	}
	switch m.mode {
	case modeCreate:
		return m.updateCreate(msg)
	case modeAdd:
		return m.updateAdd(msg)
	case modeRemove:
		return m.updateRemove(msg)
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
		m.form = m.newWorkspaceNameForm()
		m.layoutForm(m.form)
		return m.form.Init()
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
		if len(m.issues) > 0 {
			m.step = skAddCheckFailed
			return nil
		}
		m.history = append(m.history, "repos checked")
		return m.startFocusFlowAfterReposReadyCmd()
	case skAddBuilding:
		if m.workErr != nil {
			return tea.Quit
		}
		m.buildAddSummary()
		m.step = skAddSummary
		return nil
	case skRemoveWork:
		m.summaryLines = nil
		if m.workErr != nil {
			m.summaryLines = append(m.summaryLines, red.Render(git.ErrorMsg(m.workErr)))
		} else {
			m.history = append(m.history, "removed: "+m.removeTarget)
			m.summaryLines = append(m.summaryLines, bold.Render("removed"))
			m.summaryLines = append(m.summaryLines, green.Render(m.removeTarget))
		}
		m.summaryLines = append(m.summaryLines, "")
		m.summaryLines = append(m.summaryLines, gray.Render("cd ")+cyan.Render(m.wsDir))
		m.step = skRemoveSummary
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

func (m *appModel) startFocusFlowAfterReposReadyCmd() tea.Cmd {
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
		if m.mode == modeCreate {
			m.step = skCreateBuilding
			return m.beginCreateBuild()
		}
		m.step = skAddBuilding
		return m.beginAddBuildAll()
	}
	repo := m.focusQueue[0]
	opts := append([]string{"everything"}, findTopLevelDirs(filepath.Join(m.source, repo))...)
	m.form = m.newFocusPickForm(repo+": focus directories", opts)
	m.layoutForm(m.form)
	if m.mode == modeCreate {
		m.step = skCreateFocus
	} else {
		m.step = skAddFocus
	}
	return m.form.Init()
}

func (m *appModel) applyFocusPickAndAdvance() (tea.Model, tea.Cmd) {
	repo := m.focusQueue[0]
	vals := append([]string(nil), m.focusPick...)
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
		m.form = nil
		if m.mode == modeCreate {
			m.step = skCreateBuilding
			return m, m.beginCreateBuild()
		}
		m.step = skAddBuilding
		return m, m.beginAddBuildAll()
	}
	nextRepo := m.focusQueue[0]
	opts := append([]string{"everything"}, findTopLevelDirs(filepath.Join(m.source, nextRepo))...)
	m.form = m.newFocusPickForm(nextRepo+": focus directories", opts)
	m.layoutForm(m.form)
	return m, m.form.Init()
}

func (m *appModel) buildAddSummary() {
	m.summaryLines = nil
	m.summaryLines = append(m.summaryLines, bold.Render("added to workspace"))
	m.summaryLines = append(m.summaryLines, cyan.Render(m.wsDir))
	m.summaryLines = append(m.summaryLines, "")
	for _, r := range m.results {
		if r.ok {
			m.summaryLines = append(m.summaryLines, green.Render("✓ ")+r.repo+magenta.Render(" → ")+gray.Render(r.msg))
		} else {
			m.summaryLines = append(m.summaryLines, red.Render("✗ ")+r.repo+magenta.Render(" → ")+red.Render(r.msg))
		}
	}
	m.summaryLines = append(m.summaryLines, "")
	m.summaryLines = append(m.summaryLines, gray.Render("cd ")+cyan.Render(m.wsDir))
}

func (m *appModel) beginAddBuildAll() tea.Cmd {
	m.beginSpinner("adding repositories")
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	wsDir := m.wsDir
	source := m.source
	selected := append([]string(nil), m.selected...)
	focusNew := m.focus
	resultsHolder := &m.results
	wsBranch := filepath.Base(m.wsDir)
	go func() {
		var results []wtreeResult
		n := len(selected)
		for i, repo := range selected {
			ch <- evtStatus{phase: "git worktree", detail: fmt.Sprintf("[%d/%d]  add  ·  branch %s  ·  %s", i+1, n, wsBranch, repo)}
			repoPath := filepath.Join(source, repo)
			dest := filepath.Join(wsDir, repo)
			err := createWorktree(repoPath, dest, wsBranch)
			reused := false
			if err != nil && isExistingWorkspaceWorktree(repoPath, dest, wsBranch) {
				err = nil
				reused = true
			}
			if err != nil {
				results = append(results, wtreeResult{repo: repo, ok: false, msg: git.ErrorMsg(err)})
			} else {
				msg := "focus: " + focusLabel(focusNew[repo])
				if reused {
					msg = "worktree already present, " + msg
				}
				results = append(results, wtreeResult{repo: repo, ok: true, msg: msg})
			}
		}
		ch <- evtStatus{phase: "focus & workspace file", detail: "merge CLAUDE.local.md  ·  " + filepath.Base(wsDir) + ".code-workspace"}
		merged := readFocusDirs(wsDir)
		for _, r := range results {
			if !r.ok {
				continue
			}
			merged[r.repo] = focusNew[r.repo]
		}
		writeFocusConfig(wsDir, merged)
		*resultsHolder = results
		ch <- evtDone{err: nil}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
}

func (m *appModel) updateCreate(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skCreatePickRepos:
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			sort.Strings(m.pickRepos)
			m.selected = append([]string(nil), m.pickRepos...)
			m.history = append(m.history, "repos: "+strings.Join(m.selected, ", "))
			m.step = skCreateChecking
			m.issues = nil
			m.form = nil
			return m, m.beginCheckRepos()
		})
	case skCreateCheckFailed:
		if _, ok := msg.(tea.KeyPressMsg); ok {
			return m, tea.Quit
		}
	case skCreateName:
		if m.form == nil {
			m.form = m.newWorkspaceNameForm()
			m.layoutForm(m.form)
			return m, m.form.Init()
		}
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			m.wsName = strings.TrimSpace(m.wsNameDraft)
			m.form = nil
			m.history = append(m.history, "name: "+m.wsName)
			return m, m.startFocusFlowAfterReposReadyCmd()
		})
	case skCreateFocus:
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			return m.applyFocusPickAndAdvance()
		})
	case skCreateSummary:
		if k, ok := msg.(tea.KeyPressMsg); ok && k.String() == "enter" {
			wsPath := filepath.Join(m.workspaces, m.wsName)
			m.exitSummary = fmt.Sprintf("created workspace %s: %s", m.wsName, wsPath)
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *appModel) updateAdd(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skAddPickRepos:
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			sort.Strings(m.pickRepos)
			m.selected = append([]string(nil), m.pickRepos...)
			m.history = append(m.history, "repos: "+strings.Join(m.selected, ", "))
			m.step = skAddChecking
			m.issues = nil
			m.form = nil
			return m, m.beginCheckRepos()
		})
	case skAddCheckFailed:
		if _, ok := msg.(tea.KeyPressMsg); ok {
			return m, tea.Quit
		}
	case skAddFocus:
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			return m.applyFocusPickAndAdvance()
		})
	case skAddSummary:
		if k, ok := msg.(tea.KeyPressMsg); ok && k.String() == "enter" {
			m.exitSummary = fmt.Sprintf("added %s → %s", strings.Join(m.selected, ", "), m.wsDir)
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *appModel) beginRemoveWork() tea.Cmd {
	m.beginSpinner("removing " + m.removeTarget)
	m.workCh = make(chan interface{}, 128)
	ch := m.workCh
	wsDir := m.wsDir
	source := m.source
	repo := m.removeTarget
	go func() {
		ch <- evtStatus{phase: "git worktree remove", detail: repo}
		err := removeOneWorktree(wsDir, source, repo)
		if err == nil {
			fm := readFocusDirs(wsDir)
			delete(fm, repo)
			writeFocusConfig(wsDir, fm)
		}
		ch <- evtDone{err: err}
	}()
	return tea.Batch(func() tea.Msg { return m.sp.Tick() }, pollWorkChan(m.workCh))
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

func (m *appModel) updateRemove(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skRemovePick:
		if m.form == nil {
			m.form = m.newRemovePickForm()
			m.layoutForm(m.form)
			return m, m.form.Init()
		}
		next, cmd := m.form.Update(msg)
		if f, ok := next.(*huh.Form); ok {
			m.form = f
		}
		switch m.form.State {
		case huh.StateAborted:
			return m, tea.Quit
		case huh.StateCompleted:
			m.removeTarget = m.removePick
			m.form = m.newRemoveConfirmForm()
			m.layoutForm(m.form)
			m.step = skRemoveConfirm
			return m, m.form.Init()
		}
		return m, cmd
	case skRemoveConfirm:
		if m.form == nil {
			m.form = m.newRemoveConfirmForm()
			m.layoutForm(m.form)
			return m, m.form.Init()
		}
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			ok := m.delYes
			m.form = nil
			if !ok {
				return m, tea.Quit
			}
			m.step = skRemoveWork
			return m, m.beginRemoveWork()
		})
	case skRemoveSummary:
		if k, ok := msg.(tea.KeyPressMsg); ok && k.String() == "enter" {
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m *appModel) updateDelete(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m.step {
	case skDeleteConfirm:
		if m.form == nil {
			m.form = m.newDeleteConfirmForm()
			m.layoutForm(m.form)
			return m, m.form.Init()
		}
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			ok := m.delYes
			m.form = nil
			if !ok {
				return m, tea.Quit
			}
			m.step = skDeleteWork
			return m, m.beginDeleteWork()
		})
	case skDeleteForceConfirm:
		if m.form == nil {
			m.form = m.newForceDeleteConfirmForm()
			m.layoutForm(m.form)
			return m, m.form.Init()
		}
		return m.forwardHuh(msg, func() (tea.Model, tea.Cmd) {
			ok := m.delYes
			m.form = nil
			if !ok {
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
		})
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
			b.WriteString(m.bannerLine("create workspace", m.workspaces))
			b.WriteString(m.historyLine())
		case modeAdd:
			b.WriteString(m.bannerLine("add repositories", m.wsDir))
			b.WriteString(m.historyLine())
		case modeRemove:
			b.WriteString(m.bannerLine("remove repository", m.wsDir))
			b.WriteString(m.historyLine())
		case modeDelete:
			b.WriteString(m.bannerLine("delete workspace", filepath.Base(m.wsDir)))
		}
		b.WriteString(m.asyncBlock())
		return m.viewAlt(b.String())
	}
	var b strings.Builder
	switch m.mode {
	case modeCreate:
		b.WriteString(m.bannerLine("create workspace", m.workspaces))
		b.WriteString(m.historyLine())
		switch m.step {
		case skCreatePickRepos, skCreateFocus:
			if m.form != nil {
				b.WriteString(m.form.View())
			}
		case skCreateCheckFailed:
			for _, i := range m.issues {
				b.WriteString(red.Render(i) + "\n")
			}
			b.WriteString(red.Render("fix the issues above and try again") + "\n")
			b.WriteString(gray.Render("any key · exit") + "\n")
		case skCreateName:
			if m.form != nil {
				b.WriteString(m.form.View())
			}
		case skCreateSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	case modeAdd:
		b.WriteString(m.bannerLine("add repositories", m.wsDir))
		b.WriteString(m.historyLine())
		switch m.step {
		case skAddPickRepos, skAddFocus:
			if m.form != nil {
				b.WriteString(m.form.View())
			}
		case skAddCheckFailed:
			for _, i := range m.issues {
				b.WriteString(red.Render(i) + "\n")
			}
			b.WriteString(red.Render("fix the issues above and try again") + "\n")
			b.WriteString(gray.Render("any key · exit") + "\n")
		case skAddSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	case modeRemove:
		b.WriteString(m.bannerLine("remove repository", m.wsDir))
		b.WriteString(m.historyLine())
		switch m.step {
		case skRemovePick, skRemoveConfirm:
			if m.form != nil {
				b.WriteString(m.form.View())
			}
		case skRemoveSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	case modeDelete:
		b.WriteString(m.bannerLine("delete workspace", filepath.Base(m.wsDir)))
		switch m.step {
		case skDeleteConfirm:
			if len(m.delDirty) > 0 {
				b.WriteString(yellow.Render("uncommitted changes in: "+strings.Join(m.delDirty, ", ")) + "\n\n")
			}
			if m.form != nil {
				b.WriteString(m.form.View())
			}
		case skDeleteForceConfirm:
			for _, ln := range m.forceShowLines {
				b.WriteString(ln + "\n")
			}
			b.WriteString("\n")
			if m.form != nil {
				b.WriteString(m.form.View())
			}
		case skDeleteSummary:
			b.WriteString(summaryPanel.Render(lipgloss.JoinVertical(lipgloss.Left, m.summaryLines...)) + "\n")
			b.WriteString(gray.Render("enter · exit") + "\n")
		}
	}
	return m.viewAlt(b.String())
}
