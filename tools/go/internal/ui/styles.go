package ui

import "github.com/charmbracelet/lipgloss"

var (
	Cyan   = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	Gray   = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	Green  = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	Yellow = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	Red    = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
	Bold   = lipgloss.NewStyle().Bold(true)
)
