package main

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"dotfiles/tools/internal/ui"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

var (
	boxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("6")).
			Padding(1, 3)

	timerStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("6")).
			Bold(true)

	dimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8")).
			Italic(true)

	titleBar = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))
)

type pomMode int

const (
	modePom pomMode = iota
	modeBreak
	modeEditTask
)

type tickMsg time.Time

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

type appModel struct {
	mode       pomMode
	minutes    int
	task       string
	startTime  time.Time
	now        time.Time
	inputBuf   string
	taskBuf    string
	breakStart time.Time
	saved      bool
	width      int
}

func newApp(minutes int, task string) *appModel {
	now := time.Now()
	return &appModel{
		mode:      modePom,
		minutes:   minutes,
		task:      task,
		startTime: now,
		now:       now,
		width:     80,
	}
}

func (m *appModel) Init() tea.Cmd {
	return tickCmd()
}

func (m *appModel) viewAlt(content string) tea.View {
	v := tea.NewView(content)
	v.AltScreen = true
	return v
}

func (m *appModel) bannerLine() string {
	line := titleBar.Render("pom")
	if m.task != "" {
		line += ui.Gray.Render("  " + m.task)
	}
	return line + "\n"
}

func (m *appModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		return m, nil

	case tickMsg:
		m.now = time.Time(msg)
		if m.mode == modePom {
			total := m.minutes * 60
			elapsed := int(m.now.Sub(m.startTime).Seconds())
			if elapsed >= total && !m.saved {
				m.saved = true
				saveHistory(m.startTime, total, m.task)
				go notify(m.task, m.minutes)
				m.mode = modeBreak
				m.breakStart = m.now
			}
		}
		return m, tickCmd()

	case tea.KeyPressMsg:
		switch m.mode {
		case modePom:
			if msg.String() == "e" {
				elapsed := int(m.now.Sub(m.startTime).Seconds())
				m.saved = true
				saveHistory(m.startTime, elapsed, m.task)
				m.mode = modeBreak
				m.breakStart = m.now
			}
			if msg.String() == "ctrl+c" {
				if !m.saved {
					elapsed := int(m.now.Sub(m.startTime).Seconds())
					saveHistory(m.startTime, elapsed, m.task)
				}
				return m, tea.Quit
			}

		case modeEditTask:
			switch msg.String() {
			case "enter":
				m.task = m.taskBuf
				m.taskBuf = ""
				m.mode = modeBreak
			case "esc":
				m.taskBuf = ""
				m.mode = modeBreak
			case "backspace":
				if len(m.taskBuf) > 0 {
					m.taskBuf = m.taskBuf[:len(m.taskBuf)-1]
				}
			default:
				if len(msg.String()) == 1 {
					m.taskBuf += msg.String()
				}
			}

		case modeBreak:
			switch msg.String() {
			case "enter":
				next := m.minutes
				if m.inputBuf != "" {
					if n, err := strconv.Atoi(m.inputBuf); err == nil {
						next = n
					}
				}
				m.minutes = next
				m.startTime = time.Now()
				m.now = m.startTime
				m.inputBuf = ""
				m.breakStart = time.Time{}
				m.saved = false
				m.mode = modePom
				return m, tickCmd()
			case "t":
				m.taskBuf = m.task
				m.mode = modeEditTask
			case "esc", "ctrl+c":
				return m, tea.Quit
			case "backspace":
				if len(m.inputBuf) > 0 {
					m.inputBuf = m.inputBuf[:len(m.inputBuf)-1]
				}
			default:
				if len(msg.String()) == 1 && msg.String() >= "0" && msg.String() <= "9" {
					m.inputBuf += msg.String()
				}
			}
		}
	}
	return m, nil
}

func (m *appModel) View() tea.View {
	var b strings.Builder
	b.WriteString(m.bannerLine())

	var content strings.Builder

	switch m.mode {
	case modeEditTask:
		content.WriteString(ui.Yellow.Bold(true).Render("Edit task:") + "\n\n")
		content.WriteString(ui.Cyan.Render(m.taskBuf) + ui.Gray.Render("_") + "\n\n")
		content.WriteString(dimStyle.Render("enter to save, esc to cancel"))

	case modeBreak:
		breakElapsed := int(m.now.Sub(m.breakStart).Seconds())
		nextMinutes := strconv.Itoa(m.minutes)
		if m.inputBuf != "" {
			nextMinutes = m.inputBuf
		}

		content.WriteString(ui.Green.Bold(true).Render("Break time!") + "\n\n")
		content.WriteString(ui.Gray.Render("break  ") + ui.Yellow.Bold(true).Render(formatRemaining(breakElapsed)) + "\n")
		if m.task != "" {
			content.WriteString(ui.Gray.Render("task   ") + ui.Cyan.Render(m.task) + "\n")
		}
		content.WriteString("\n")
		content.WriteString(dimStyle.Render("enter") + ui.Gray.Render(" start ") + ui.Green.Bold(true).Render(nextMinutes+"m") + ui.Gray.Render(" pom") + "\n")
		if m.inputBuf != "" {
			content.WriteString(dimStyle.Render("type numbers to change duration") + "\n")
		}
		content.WriteString(dimStyle.Render("t") + ui.Gray.Render(" edit task  ") + dimStyle.Render("esc") + ui.Gray.Render(" quit"))

	case modePom:
		total := m.minutes * 60
		elapsed := int(m.now.Sub(m.startTime).Seconds())
		remaining := total - elapsed
		if remaining < 0 {
			remaining = 0
		}
		percent := 0
		if total > 0 {
			percent = min(100, elapsed*100/total)
		}

		endTime := m.startTime.Add(time.Duration(m.minutes) * time.Minute)
		barWidth := m.width - 18
		if barWidth > 40 {
			barWidth = 40
		}
		if barWidth < 10 {
			barWidth = 10
		}

		timeRange := ui.Gray.Render(formatTime(m.startTime)) + ui.Gray.Render(" → ") + ui.Green.Render(formatTime(endTime))
		content.WriteString(timeRange + "\n\n")
		content.WriteString(timerStyle.Render(formatRemainingLarge(remaining)) + "\n\n")
		content.WriteString(gradientBar(percent, barWidth) + " " + dimStyle.Render(fmt.Sprintf("%d%%", percent)) + "\n")
		if m.task != "" {
			content.WriteString("\n" + ui.Gray.Render(m.task))
		}
		content.WriteString("\n\n" + dimStyle.Render("e") + ui.Gray.Render(" end early  ") + dimStyle.Render("ctrl+c") + ui.Gray.Render(" quit"))
	}

	b.WriteString(boxStyle.Render(content.String()))
	b.WriteString("\n")

	return m.viewAlt(b.String())
}
