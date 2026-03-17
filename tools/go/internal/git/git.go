package git

import (
	"os/exec"
	"strings"
)

func Run(args string, cwd string) string {
	cmd := exec.Command("git", strings.Fields(args)...)
	cmd.Dir = cwd
	out, _ := cmd.Output()
	return strings.TrimSpace(string(out))
}

func RunArgs(args []string, cwd string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func ErrorMsg(err error) string {
	if exitErr, ok := err.(*exec.ExitError); ok {
		stderr := strings.TrimSpace(string(exitErr.Stderr))
		if stderr != "" {
			return stderr
		}
	}
	return err.Error()
}
