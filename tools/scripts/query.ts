#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const Q_DIR = join(process.env.HOME!, ".local", "share", "q");
const CONVO_FILE = join(Q_DIR, "current");
const SYSTEM_PROMPT = "Answer concisely. No markdown formatting. Plain text only.";

mkdirSync(Q_DIR, { recursive: true });

function ask(model: string, prompt: string): string {
  return execSync(
    `claude -p --model ${model} --no-session-persistence --system-prompt ${JSON.stringify(SYSTEM_PROMPT)}`,
    { input: prompt, stdio: ["pipe", "pipe", "pipe"] }
  ).toString();
}

function loadConvo(): string | null {
  if (existsSync(CONVO_FILE)) return readFileSync(CONVO_FILE, "utf-8");
  return null;
}

function saveConvo(question: string, response: string, append: boolean) {
  const entry = `User: ${question}\nAssistant: ${response}`;
  if (append && existsSync(CONVO_FILE)) {
    const existing = readFileSync(CONVO_FILE, "utf-8");
    writeFileSync(CONVO_FILE, existing + "\n" + entry);
  } else {
    writeFileSync(CONVO_FILE, entry);
  }
}

function deleteConvo() {
  if (existsSync(CONVO_FILE)) {
    unlinkSync(CONVO_FILE);
    console.log("conversation deleted");
  } else {
    console.log("no conversation");
  }
}

const args = process.argv.slice(2);
const cmd = args[0] || "";

if (cmd === "h") {
  const convo = loadConvo();
  if (convo) {
    console.log(convo);
  } else {
    console.log("no conversation");
  }
  process.exit(0);
}

if (cmd === "d") {
  deleteConvo();
  process.exit(0);
}

if (cmd === "q") {
  const question = args.slice(1).join(" ");
  if (!question) {
    console.error("usage: q q <question>");
    process.exit(1);
  }
  const response = ask("sonnet", question);
  process.stdout.write(response);
  process.exit(0);
}

if (cmd === "c") {
  const question = args.slice(1).join(" ");
  if (!question) {
    console.error("usage: q c <question>");
    process.exit(1);
  }
  const convo = loadConvo();
  const prompt = convo
    ? `Previous conversation:\n${convo}\n\nNew question: ${question}`
    : question;
  const response = ask("claude-opus-4-6", prompt);
  process.stdout.write(response);
  saveConvo(question, response.trim(), !!convo);
  process.exit(0);
}

if (cmd === "n") {
  const question = args.slice(1).join(" ");
  if (!question) {
    console.error("usage: q <question>");
    process.exit(1);
  }
  const response = ask("claude-opus-4-6", question);
  process.stdout.write(response);
  saveConvo(question, response.trim(), false);
  process.exit(0);
}

// default: new question
const question = args.join(" ");
if (!question) {
  console.error("usage: q <question>");
  console.error("  q <question>       new question (opus)");
  console.error("  q n <question>     new question (opus, explicit)");
  console.error("  q c <question>     continue conversation (opus)");
  console.error("  q q <question>     quick one-shot (sonnet)");
  console.error("  q h                show conversation history");
  console.error("  q d                delete conversation");
  process.exit(1);
}
const response = ask("claude-opus-4-6", question);
process.stdout.write(response);
saveConvo(question, response.trim(), false);
