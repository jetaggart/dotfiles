package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var (
	pomDir      = filepath.Join(os.Getenv("HOME"), ".pom")
	historyFile = filepath.Join(pomDir, "history.csv")

	cyan   = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	gray   = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	green  = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	yellow = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	bold   = lipgloss.NewStyle().Bold(true)
)

type mode int

const (
	modePom mode = iota
	modeBreak
	modeEditTask
)

type tickMsg time.Time

func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

type model struct {
	mode       mode
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

func initialModel(minutes int, task string) model {
	now := time.Now()
	return model{
		mode:      modePom,
		minutes:   minutes,
		task:      task,
		startTime: now,
		now:       now,
		width:     80,
	}
}

func (m model) Init() tea.Cmd {
	return tickCmd()
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
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

	case tea.KeyMsg:
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
			case "esc":
				return m, tea.Quit
			case "ctrl+c":
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

func (m model) View() string {
	var s strings.Builder
	s.WriteString("\n")

	switch m.mode {
	case modeEditTask:
		s.WriteString(yellow.Bold(true).Render("Edit task:") + "\n")
		s.WriteString(cyan.Render(m.taskBuf) + gray.Render("_") + "\n")
		s.WriteString("\n")
		s.WriteString(gray.Render("Enter to save, Esc to cancel") + "\n")

	case modeBreak:
		breakElapsed := int(m.now.Sub(m.breakStart).Seconds())
		nextMinutes := strconv.Itoa(m.minutes)
		if m.inputBuf != "" {
			nextMinutes = m.inputBuf
		}

		s.WriteString(green.Bold(true).Render("Break time!") + "\n")
		s.WriteString(gray.Render("Break: ") + yellow.Bold(true).Render(formatRemaining(breakElapsed)) + "\n")
		if m.task != "" {
			s.WriteString(gray.Render("Task: "+m.task) + "\n")
		}
		s.WriteString("\n")
		s.WriteString(gray.Render("Press ") + cyan.Bold(true).Render("Enter") + gray.Render(" to start ") + green.Bold(true).Render(nextMinutes+"m") + gray.Render(" pom") + "\n")
		if m.inputBuf != "" {
			s.WriteString(gray.Render("(type numbers to change duration)") + "\n")
		}
		s.WriteString(gray.Render("Press t to edit task, Esc to quit") + "\n")

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
		barWidth := m.width - 10
		if barWidth > 50 {
			barWidth = 50
		}
		if barWidth < 10 {
			barWidth = 10
		}

		s.WriteString(gray.Render(formatTime(m.startTime)) + gray.Render(" - ") + green.Render(formatTime(endTime)) + "\n")
		s.WriteString(cyan.Bold(true).Render(formatRemaining(remaining)) + "\n")
		s.WriteString(gradientBar(percent, barWidth) + "\n")
		pctStr := fmt.Sprintf("%d%%", percent)
		pad := barWidth - len(pctStr)
		if pad < 0 {
			pad = 0
		}
		s.WriteString(strings.Repeat(" ", pad) + pctStr + "\n")
		if m.task != "" {
			s.WriteString(gray.Render(m.task) + "\n")
		}
	}

	return s.String()
}

func formatTime(t time.Time) string {
	h := t.Hour() % 12
	if h == 0 {
		h = 12
	}
	ampm := "AM"
	if t.Hour() >= 12 {
		ampm = "PM"
	}
	return fmt.Sprintf("%d:%02d %s", h, t.Minute(), ampm)
}

func formatRemaining(seconds int) string {
	if seconds < 0 {
		seconds = 0
	}
	return fmt.Sprintf("%dm%02ds", seconds/60, seconds%60)
}

func gradientBar(percent, width int) string {
	filled := percent * width / 100
	empty := width - filled
	var s strings.Builder
	for i := 0; i < filled; i++ {
		ratio := float64(i) / float64(width)
		r := int(66 + ratio*float64(138-66))
		g := int(133 + ratio*float64(43-133))
		b := int(244 + ratio*float64(226-244))
		style := lipgloss.NewStyle().Foreground(lipgloss.Color(fmt.Sprintf("#%02x%02x%02x", r, g, b)))
		s.WriteString(style.Render("█"))
	}
	s.WriteString(gray.Render(strings.Repeat("░", empty)))
	return s.String()
}

func saveHistory(start time.Time, elapsedSec int, task string) {
	if elapsedSec < 60 {
		return
	}
	os.MkdirAll(pomDir, 0755)
	f, err := os.OpenFile(historyFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	w := csv.NewWriter(f)
	w.Write([]string{
		start.Format("2006-01-02 15:04:05"),
		strconv.Itoa(elapsedSec),
		task,
	})
	w.Flush()
}

func displayHistory(count int) {
	data, err := os.ReadFile(historyFile)
	if err != nil || len(strings.TrimSpace(string(data))) == 0 {
		fmt.Println("No history yet.")
		return
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	start := len(lines) - count
	if start < 0 {
		start = 0
	}

	fmt.Println()
	fmt.Println(bold.Render("  DATE                 DURATION   TASK"))
	fmt.Println()
	for i := len(lines) - 1; i >= start; i-- {
		r := csv.NewReader(strings.NewReader(lines[i]))
		fields, err := r.Read()
		if err != nil || len(fields) < 3 {
			continue
		}
		date := fields[0]
		secs, _ := strconv.Atoi(fields[1])
		task := fields[2]
		mins := secs / 60
		s := secs % 60
		duration := fmt.Sprintf("%dm", mins)
		if s > 0 {
			duration = fmt.Sprintf("%dm%ds", mins, s)
		}
		fmt.Printf("  %s   %s   %s\n", gray.Render(date), cyan.Render(fmt.Sprintf("%-8s", duration)), task)
	}
	fmt.Println()
}

func notify(task string, minutes int) {
	msg := task
	if msg == "" {
		msg = fmt.Sprintf("%d minute session finished", minutes)
	}
	exec.Command("osascript", "-e", fmt.Sprintf(`display notification "%s" with title "Pomodoro Complete!" sound name "default"`, msg)).Run()
}

func main() {
	args := os.Args[1:]

	if len(args) > 0 && args[0] == "-h" {
		count := 5
		if len(args) > 1 {
			if n, err := strconv.Atoi(args[1]); err == nil {
				count = n
			}
		}
		displayHistory(count)
		return
	}

	minutes := 25
	task := ""
	if len(args) > 0 {
		if n, err := strconv.Atoi(args[0]); err == nil {
			minutes = n
			task = strings.Join(args[1:], " ")
		} else {
			task = strings.Join(args, " ")
		}
	}

	p := tea.NewProgram(initialModel(minutes, task))
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
