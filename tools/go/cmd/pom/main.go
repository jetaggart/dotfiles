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

	"dotfiles/tools/internal/ui"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

var (
	pomDir      = filepath.Join(os.Getenv("HOME"), ".pom")
	historyFile = filepath.Join(pomDir, "history.csv")
)

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

func formatRemainingLarge(seconds int) string {
	if seconds < 0 {
		seconds = 0
	}
	return fmt.Sprintf("%d:%02d", seconds/60, seconds%60)
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
	s.WriteString(ui.Gray.Render(strings.Repeat("░", empty)))
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

	var content strings.Builder
	content.WriteString(ui.Bold.Render("DATE                 DURATION   TASK") + "\n\n")
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
		content.WriteString(fmt.Sprintf("%s   %s   %s\n", ui.Gray.Render(date), ui.Cyan.Render(fmt.Sprintf("%-8s", duration)), task))
	}

	fmt.Println()
	fmt.Println(boxStyle.Render(strings.TrimRight(content.String(), "\n")))
	fmt.Println()
}

func notify(task string, minutes int) {
	msg := task
	if msg == "" {
		msg = fmt.Sprintf("%d minute session finished", minutes)
	}
	exec.Command("osascript", "-e", fmt.Sprintf(`display notification "%s" with title "Pomodoro Complete!" sound name "default"`, msg)).Run()
}

func printUsage() {
	head := titleBar.Render("pom") + ui.Gray.Render(" — pomodoro timer")
	body := lipgloss.JoinVertical(lipgloss.Left,
		head,
		"",
		ui.Cyan.Render("start")+ui.Gray.Render("    pom [minutes] [task]"),
		ui.Cyan.Render("history")+ui.Gray.Render("  pom -h [count]"),
	)
	fmt.Fprintln(os.Stderr, boxStyle.Padding(0, 1).Render(body))
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

	if _, err := tea.NewProgram(newApp(minutes, task)).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
