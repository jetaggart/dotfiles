package ui

import "charm.land/lipgloss/v2"

var (
	Cyan    = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	Gray    = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	Green   = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	Yellow  = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	Red     = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
	Magenta = lipgloss.NewStyle().Foreground(lipgloss.Color("5"))
	Bold    = lipgloss.NewStyle().Bold(true)
)
