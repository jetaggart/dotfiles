package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var (
	qDir       = filepath.Join(os.Getenv("HOME"), ".local", "share", "q")
	convoFile  = filepath.Join(qDir, "current")
	systemPrompt = "Answer concisely. No markdown formatting. Plain text only."
)

func ask(model string, prompt string) string {
	cmd := exec.Command("claude", "-p", "--model", model, "--no-session-persistence", "--system-prompt", systemPrompt)
	cmd.Stdin = strings.NewReader(prompt)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintf(os.Stderr, "claude error: %v\n", err)
		os.Exit(1)
	}
	return string(out)
}

func loadConvo() (string, bool) {
	data, err := os.ReadFile(convoFile)
	if err != nil {
		return "", false
	}
	return string(data), true
}

func saveConvo(question, response string, append bool) {
	entry := fmt.Sprintf("User: %s\nAssistant: %s", question, response)
	if append {
		if existing, ok := loadConvo(); ok {
			os.WriteFile(convoFile, []byte(existing+"\n"+entry), 0644)
			return
		}
	}
	os.WriteFile(convoFile, []byte(entry), 0644)
}

func main() {
	os.MkdirAll(qDir, 0755)

	args := os.Args[1:]
	cmd := ""
	if len(args) > 0 {
		cmd = args[0]
	}

	switch cmd {
	case "h":
		if convo, ok := loadConvo(); ok {
			fmt.Println(convo)
		} else {
			fmt.Println("no conversation")
		}

	case "d":
		if err := os.Remove(convoFile); err != nil {
			fmt.Println("no conversation")
		} else {
			fmt.Println("conversation deleted")
		}

	case "q":
		question := strings.Join(args[1:], " ")
		if question == "" {
			fmt.Fprintln(os.Stderr, "usage: q q <question>")
			os.Exit(1)
		}
		response := ask("sonnet", question)
		fmt.Print(response)

	case "c":
		question := strings.Join(args[1:], " ")
		if question == "" {
			fmt.Fprintln(os.Stderr, "usage: q c <question>")
			os.Exit(1)
		}
		convo, hasConvo := loadConvo()
		prompt := question
		if hasConvo {
			prompt = fmt.Sprintf("Previous conversation:\n%s\n\nNew question: %s", convo, question)
		}
		response := ask("claude-opus-4-6", prompt)
		fmt.Print(response)
		saveConvo(question, strings.TrimSpace(response), hasConvo)

	case "n":
		question := strings.Join(args[1:], " ")
		if question == "" {
			fmt.Fprintln(os.Stderr, "usage: q <question>")
			os.Exit(1)
		}
		response := ask("claude-opus-4-6", question)
		fmt.Print(response)
		saveConvo(question, strings.TrimSpace(response), false)

	default:
		question := strings.Join(args, " ")
		if question == "" {
			fmt.Fprintln(os.Stderr, "usage: q <question>")
			fmt.Fprintln(os.Stderr, "  q <question>       new question (opus)")
			fmt.Fprintln(os.Stderr, "  q n <question>     new question (opus, explicit)")
			fmt.Fprintln(os.Stderr, "  q c <question>     continue conversation (opus)")
			fmt.Fprintln(os.Stderr, "  q q <question>     quick one-shot (sonnet)")
			fmt.Fprintln(os.Stderr, "  q h                show conversation history")
			fmt.Fprintln(os.Stderr, "  q d                delete conversation")
			os.Exit(1)
		}
		response := ask("claude-opus-4-6", question)
		fmt.Print(response)
		saveConvo(question, strings.TrimSpace(response), false)
	}
}
