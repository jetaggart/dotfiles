import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { join } from "path"

const qDir = join(process.env.HOME!, ".local", "share", "q")
const convoFile = join(qDir, "current")
const systemPrompt = "Answer concisely. No markdown formatting. Plain text only."

function ask(model: string, prompt: string): string {
  const result = Bun.spawnSync(
    ["claude", "-p", "--model", model, "--no-session-persistence", "--system-prompt", systemPrompt],
    { stdin: new TextEncoder().encode(prompt), stderr: "inherit" },
  )
  if (result.exitCode !== 0) {
    process.stderr.write("claude error\n")
    process.exit(1)
  }
  return result.stdout.toString()
}

function loadConvo(): string | null {
  try {
    return readFileSync(convoFile, "utf-8")
  } catch {
    return null
  }
}

function saveConvo(question: string, response: string, append: boolean) {
  const entry = `User: ${question}\nAssistant: ${response}`
  if (append) {
    const existing = loadConvo()
    if (existing) {
      writeFileSync(convoFile, existing + "\n" + entry)
      return
    }
  }
  writeFileSync(convoFile, entry)
}

export function queryMain(args: string[]) {
  mkdirSync(qDir, { recursive: true })

  const cmd = args[0] ?? ""

  switch (cmd) {
    case "h": {
      const convo = loadConvo()
      console.log(convo ?? "no conversation")
      break
    }

    case "d": {
      try {
        unlinkSync(convoFile)
        console.log("conversation deleted")
      } catch {
        console.log("no conversation")
      }
      break
    }

    case "q": {
      const question = args.slice(1).join(" ")
      if (!question) {
        process.stderr.write("usage: q q <question>\n")
        process.exit(1)
      }
      process.stdout.write(ask("sonnet", question))
      break
    }

    case "c": {
      const question = args.slice(1).join(" ")
      if (!question) {
        process.stderr.write("usage: q c <question>\n")
        process.exit(1)
      }
      const convo = loadConvo()
      const prompt = convo
        ? `Previous conversation:\n${convo}\n\nNew question: ${question}`
        : question
      const response = ask("claude-opus-4-6", prompt)
      process.stdout.write(response)
      saveConvo(question, response.trim(), convo !== null)
      break
    }

    case "n": {
      const question = args.slice(1).join(" ")
      if (!question) {
        process.stderr.write("usage: q <question>\n")
        process.exit(1)
      }
      const response = ask("claude-opus-4-6", question)
      process.stdout.write(response)
      saveConvo(question, response.trim(), false)
      break
    }

    default: {
      const question = args.join(" ")
      if (!question) {
        process.stderr.write(
          "usage: q <question>\n" +
          "  q <question>       new question (opus)\n" +
          "  q n <question>     new question (opus, explicit)\n" +
          "  q c <question>     continue conversation (opus)\n" +
          "  q q <question>     quick one-shot (sonnet)\n" +
          "  q h                show conversation history\n" +
          "  q d                delete conversation\n",
        )
        process.exit(1)
      }
      const response = ask("claude-opus-4-6", question)
      process.stdout.write(response)
      saveConvo(question, response.trim(), false)
      break
    }
  }
}
