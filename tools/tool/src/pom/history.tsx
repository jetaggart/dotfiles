import { mkdirSync, readFileSync, appendFileSync } from "fs"
import { join } from "path"
import { render, Box, Text } from "ink"

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

type HistoryEntry = { date: string; duration: string; task: string }

function loadEntries(count: number): HistoryEntry[] | null {
  let data: string
  try {
    data = readFileSync(historyFile, "utf-8").trim()
  } catch {
    return null
  }
  if (!data) return null

  const lines = data.split("\n")
  const start = Math.max(0, lines.length - count)
  const entries: HistoryEntry[] = []

  for (let i = lines.length - 1; i >= start; i--) {
    const fields = parseCSVLine(lines[i])
    if (fields.length < 3) continue
    const secs = parseInt(fields[1], 10)
    const mins = Math.floor(secs / 60)
    const s = secs % 60
    entries.push({
      date: fields[0],
      duration: s > 0 ? `${mins}m${s}s` : `${mins}m`,
      task: fields[2],
    })
  }
  return entries
}

function HistoryView({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>  DATE                 DURATION   TASK</Text>
      <Text> </Text>
      {entries.map((e, i) => (
        <Text key={i}>
          {"  "}<Text color="gray">{e.date}</Text>{"   "}<Text color="blue">{e.duration.padEnd(8)}</Text>{"   "}{e.task}
        </Text>
      ))}
    </Box>
  )
}

export function displayHistory(count: number) {
  const entries = loadEntries(count)
  if (!entries) {
    render(<Text>no history yet</Text>)
    return
  }
  render(<HistoryView entries={entries} />)
}
