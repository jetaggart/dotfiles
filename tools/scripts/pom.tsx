#!/usr/bin/env bun
import chalk from "chalk";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { Box, render, Text, useApp, useInput } from "ink";
import notifier from "node-notifier";
import { homedir } from "os";
import { join } from "path";
import { useEffect, useState } from "react";

function parseArgs(args: string[]): { minutes: number; task: string } {
  if (args.length === 0) {
    return { minutes: 25, task: "" };
  }
  const first = args[0];
  if (/^\d+$/.test(first)) {
    return { minutes: parseInt(first, 10), task: args.slice(1).join(" ") };
  }
  return { minutes: 25, task: args.join(" ") };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs.toString().padStart(2, "0")}s`;
}

function formatDateForHistory(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function saveHistory(startTime: Date, elapsedSeconds: number, task: string) {
  if (elapsedSeconds < 60) return;
  const pomDir = join(homedir(), ".pom");
  const historyFile = join(pomDir, "history.csv");
  if (!existsSync(pomDir)) {
    mkdirSync(pomDir, { recursive: true });
  }
  const escapedTask = task.includes(",") ? `"${task}"` : task;
  const entry = `${formatDateForHistory(startTime)},${elapsedSeconds},${escapedTask}\n`;
  appendFileSync(historyFile, entry);
}

function displayHistory(count: number = 5) {
  const historyFile = join(homedir(), ".pom", "history.csv");
  if (!existsSync(historyFile)) {
    console.log("No history yet.");
    return;
  }
  const content = readFileSync(historyFile, "utf-8").trim();
  if (!content) {
    console.log("No history yet.");
    return;
  }
  const lines = content.split("\n").reverse().slice(0, count);
  console.log(chalk.bold("\n  DATE                 DURATION   TASK\n"));
  for (const line of lines) {
    const match = line.match(/^([^,]+),(\d+),(.*)$/);
    if (!match) continue;
    const [, date, secs, task] = match;
    const seconds = parseInt(secs, 10);
    const mins = Math.floor(seconds / 60);
    const s = seconds % 60;
    const duration = s > 0 ? `${mins}m${s}s` : `${mins}m`;
    const cleanTask = task.replace(/^"|"$/g, "");
    console.log(`  ${chalk.gray(date)}   ${chalk.cyan(duration.padEnd(8))}   ${cleanTask}`);
  }
  console.log();
}

let sessionStartTime: Date | null = null;
let sessionTask = "";
let sessionSaved = false;

function saveOnExit() {
  if (sessionStartTime && !sessionSaved) {
    sessionSaved = true;
    const elapsed = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
    saveHistory(sessionStartTime, elapsed, sessionTask);
  }
}

process.on("SIGINT", () => {
  saveOnExit();
  process.exit(0);
});

function createGradientBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  let bar = "";
  for (let i = 0; i < filled; i++) {
    const ratio = i / width;
    const r = Math.round(66 + ratio * (138 - 66));
    const g = Math.round(133 + ratio * (43 - 133));
    const b = Math.round(244 + ratio * (226 - 244));
    bar += chalk.rgb(r, g, b)("█");
  }
  bar += chalk.gray("░".repeat(empty));
  return bar;
}

interface PomProps {
  initialMinutes: number;
  task: string;
}

function Pom({ initialMinutes, task: initialTask }: PomProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<"pom" | "break" | "editTask">("pom");
  const [minutes, setMinutes] = useState(initialMinutes);
  const [currentTask, setCurrentTask] = useState(initialTask);
  const [startTime, setStartTime] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [inputBuffer, setInputBuffer] = useState("");
  const [taskBuffer, setTaskBuffer] = useState("");
  const [breakStart, setBreakStart] = useState<Date | null>(null);

  const totalSeconds = minutes * 60;
  const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const percent = Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));
  const termWidth = process.stdout.columns || 80;
  const barWidth = Math.min(termWidth - 10, 50);

  const breakElapsed = breakStart ? Math.floor((now.getTime() - breakStart.getTime()) / 1000) : 0;

  useEffect(() => {
    sessionStartTime = startTime;
    sessionTask = currentTask;
    sessionSaved = false;
  }, [startTime, currentTask]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mode === "pom" && remainingSeconds === 0) {
      sessionSaved = true;
      saveHistory(startTime, minutes * 60, currentTask);
      notifier.notify({
        title: "Pomodoro Complete!",
        message: currentTask || `${minutes} minute session finished`,
        sound: true,
      });
      setMode("break");
      setBreakStart(new Date());
    }
  }, [mode, remainingSeconds, startTime, minutes, currentTask]);

  useInput((input, key) => {
    if (mode === "pom") {
      if (input === "e") {
        const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
        sessionSaved = true;
        saveHistory(startTime, elapsed, currentTask);
        setMode("break");
        setBreakStart(new Date());
      }
    } else if (mode === "editTask") {
      if (key.return) {
        setCurrentTask(taskBuffer);
        setTaskBuffer("");
        setMode("break");
      } else if (key.escape) {
        setTaskBuffer("");
        setMode("break");
      } else if (key.backspace || key.delete) {
        setTaskBuffer((b) => b.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setTaskBuffer((b) => b + input);
      }
    } else if (mode === "break") {
      if (key.return) {
        const nextMinutes = inputBuffer ? parseInt(inputBuffer, 10) : minutes;
        setMinutes(nextMinutes);
        setStartTime(new Date());
        setInputBuffer("");
        setBreakStart(null);
        setMode("pom");
      } else if (input === "t") {
        setTaskBuffer(currentTask);
        setMode("editTask");
      } else if (/^\d$/.test(input)) {
        setInputBuffer((b) => b + input);
      } else if (key.backspace || key.delete) {
        setInputBuffer((b) => b.slice(0, -1));
      } else if (key.escape) {
        exit();
      }
    }
  });

  if (mode === "editTask") {
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Text color="yellow" bold>Edit task:</Text>
        <Text>
          <Text color="cyan">{taskBuffer}</Text>
          <Text color="gray">_</Text>
        </Text>
        <Text> </Text>
        <Text color="gray">Enter to save, Esc to cancel</Text>
      </Box>
    );
  }

  if (mode === "break") {
    const nextMinutes = inputBuffer || String(minutes);
    return (
      <Box flexDirection="column" paddingTop={1}>
        <Text color="green" bold>Break time!</Text>
        <Text>
          <Text color="gray">Break: </Text>
          <Text bold color="yellow">{formatRemaining(breakElapsed)}</Text>
        </Text>
        {currentTask && <Text color="gray">Task: {currentTask}</Text>}
        <Text> </Text>
        <Text>
          <Text color="gray">Press </Text>
          <Text color="cyan" bold>Enter</Text>
          <Text color="gray"> to start </Text>
          <Text color="green" bold>{nextMinutes}m</Text>
          <Text color="gray"> pom</Text>
        </Text>
        {inputBuffer && <Text color="gray">(type numbers to change duration)</Text>}
        <Text color="gray">Press t to edit task, Esc to quit</Text>
      </Box>
    );
  }

  const endTime = new Date(startTime.getTime() + minutes * 60 * 1000);

  return (
    <Box flexDirection="column" paddingTop={1}>
      <Text>
        <Text color="gray">{formatTime(startTime)}</Text>
        <Text color="gray"> - </Text>
        <Text color="green">{formatTime(endTime)}</Text>
      </Text>
      <Text>
        <Text bold color="cyan">{formatRemaining(remainingSeconds)}</Text>
      </Text>
      <Text>{createGradientBar(percent, barWidth)}</Text>
      <Box justifyContent="flex-end" width={barWidth}>
        <Text>{percent}%</Text>
      </Box>
      {currentTask && <Text color="gray">{currentTask}</Text>}
    </Box>
  );
}

const args = process.argv.slice(2);

if (args[0] === "-h") {
  const count = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 5;
  displayHistory(count);
  process.exit(0);
}

const { minutes, task } = parseArgs(args);

render(<Pom initialMinutes={minutes} task={task} />);
