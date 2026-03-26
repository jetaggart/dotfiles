import { mkdirSync, readFileSync, appendFileSync } from "fs"
import { join } from "path"
import { bold, gray, cyan } from "../lib/styles"

const pomDir = join(process.env.HOME!, ".pom")
const historyFile = join(pomDir, "history.csv")

export function saveHistory(start: Date, elapsedSec: number, task: string) {
  if (elapsedSec < 60) return
  mkdirSync(pomDir, { recursive: true })
  const date = start.toISOString().replace("T", " ").slice(0, 19)
  const escaped = task.includes(",") || task.includes('"') || task.includes("\n")
    ? `"${task.replace(/"/g, '""')}"`
    : task
  const line = `${date},${elapsedSec},${escaped}\n`
  appendFileSync(historyFile, line)
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (const ch of line) {
    if (inQuotes) {
      if (ch === '"') inQuotes = false
      else current += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

export function displayHistory(count: number) {
  let data: string
  try {
    data = readFileSync(historyFile, "utf-8").trim()
  } catch {
    console.log("No history yet.")
    return
  }
  if (!data) {
    console.log("No history yet.")
    return
  }

  const lines = data.split("\n")
  const start = Math.max(0, lines.length - count)

  let content = bold("DATE                 DURATION   TASK") + "\n\n"
  for (let i = lines.length - 1; i >= start; i--) {
    const fields = parseCSVLine(lines[i])
    if (fields.length < 3) continue
    const date = fields[0]
    const secs = parseInt(fields[1], 10)
    const task = fields[2]
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    const duration = s > 0 ? `${mins}m${s}s` : `${mins}m`
    content += `${gray(date)}   ${cyan(duration.padEnd(8))}   ${task}\n`
  }

  const boxBorder = "\u250c" + "\u2500".repeat(60) + "\u2510"
  const boxBottom = "\u2514" + "\u2500".repeat(60) + "\u2518"
  console.log()
  console.log(cyan(boxBorder))
  for (const line of content.trimEnd().split("\n")) {
    console.log(cyan("\u2502") + " " + line)
  }
  console.log(cyan(boxBottom))
  console.log()
}
