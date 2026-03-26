import { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp, useStdout } from "ink"
import { saveHistory } from "./history"

type PomMode = "pom" | "break" | "editTask"

function formatTime(t: Date): string {
  let h = t.getHours() % 12
  if (h === 0) h = 12
  const ampm = t.getHours() >= 12 ? "PM" : "AM"
  return `${h}:${String(t.getMinutes()).padStart(2, "0")} ${ampm}`
}

function formatRemaining(seconds: number): string {
  if (seconds < 0) seconds = 0
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function GradientBar({ percent, width }: { percent: number; width: number }) {
  const filled = Math.floor((percent * width) / 100)
  const empty = width - filled
  let s = ""
  for (let i = 0; i < filled; i++) {
    const ratio = i / width
    const r = Math.floor(66 + ratio * (138 - 66))
    const g = Math.floor(133 + ratio * (43 - 133))
    const b = Math.floor(244 + ratio * (226 - 244))
    s += `\x1b[38;2;${r};${g};${b}m\u2588\x1b[0m`
  }
  return <Text>{s}<Text color="gray">{"\u2591".repeat(empty)}</Text> <Text dimColor>{percent}%</Text></Text>
}

function notify(task: string, minutes: number) {
  const msg = (task || `${minutes} minute session finished`).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  Bun.spawn(["osascript", "-e", `display notification "${msg}" with title "Pomodoro Complete!" sound name "default"`])
}

interface PomAppProps {
  initialMinutes: number
  initialTask: string
}

function PomApp({ initialMinutes, initialTask }: PomAppProps) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 80

  const [mode, setMode] = useState<PomMode>("pom")
  const [minutes, setMinutes] = useState(initialMinutes)
  const [task, setTask] = useState(initialTask)
  const [now, setNow] = useState(() => new Date())
  const [inputBuf, setInputBuf] = useState("")
  const [taskBuf, setTaskBuf] = useState("")
  const [breakStart, setBreakStart] = useState<Date | null>(null)
  const [saved, setSaved] = useState(false)
  const [pomStartTime, setPomStartTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (mode !== "pom") return
    const total = minutes * 60
    const elapsed = Math.floor((now.getTime() - pomStartTime.getTime()) / 1000)
    if (elapsed >= total && !saved) {
      setSaved(true)
      saveHistory(pomStartTime, total, task)
      notify(task, minutes)
      setMode("break")
      setBreakStart(new Date())
    }
  }, [now, mode, minutes, pomStartTime, saved, task])

  useInput((input, key) => {
    if (mode === "pom") {
      if (input === "e") {
        const elapsed = Math.floor((now.getTime() - pomStartTime.getTime()) / 1000)
        setSaved(true)
        saveHistory(pomStartTime, elapsed, task)
        setMode("break")
        setBreakStart(new Date())
      }
      if (key.ctrl && input === "c") {
        if (!saved) {
          const elapsed = Math.floor((now.getTime() - pomStartTime.getTime()) / 1000)
          saveHistory(pomStartTime, elapsed, task)
        }
        exit()
      }
    } else if (mode === "editTask") {
      if (key.return) {
        setTask(taskBuf)
        setTaskBuf("")
        setMode("break")
      } else if (key.escape) {
        setTaskBuf("")
        setMode("break")
      } else if (key.backspace || key.delete) {
        setTaskBuf(b => b.slice(0, -1))
      } else if (input.length === 1) {
        setTaskBuf(b => b + input)
      }
    } else if (mode === "break") {
      if (key.return) {
        const next = inputBuf ? parseInt(inputBuf, 10) || minutes : minutes
        setMinutes(next)
        setPomStartTime(new Date())
        setInputBuf("")
        setBreakStart(null)
        setSaved(false)
        setMode("pom")
      } else if (input === "t") {
        setTaskBuf(task)
        setMode("editTask")
      } else if (key.escape || (key.ctrl && input === "c")) {
        exit()
      } else if (key.backspace || key.delete) {
        setInputBuf(b => b.slice(0, -1))
      } else if (input >= "0" && input <= "9") {
        setInputBuf(b => b + input)
      }
    }
  })

  let content

  if (mode === "editTask") {
    content = (
      <Box flexDirection="column">
        <Text color="yellow" bold>Edit task:</Text>
        <Text> </Text>
        <Text><Text color="cyan">{taskBuf}</Text><Text color="gray">_</Text></Text>
        <Text> </Text>
        <Text dimColor italic>enter to save, esc to cancel</Text>
      </Box>
    )
  } else if (mode === "break") {
    const breakElapsed = breakStart ? Math.floor((now.getTime() - breakStart.getTime()) / 1000) : 0
    const nextMinutes = inputBuf || String(minutes)
    content = (
      <Box flexDirection="column">
        <Text color="green" bold>Break time!</Text>
        <Text> </Text>
        <Text><Text color="gray">break  </Text><Text color="yellow" bold>{formatRemaining(breakElapsed)}</Text></Text>
        {task ? <Text><Text color="gray">task   </Text><Text color="cyan">{task}</Text></Text> : null}
        <Text> </Text>
        <Text><Text dimColor>enter</Text><Text color="gray"> start </Text><Text color="green" bold>{nextMinutes}m</Text><Text color="gray"> pom</Text></Text>
        {inputBuf ? <Text dimColor>type numbers to change duration</Text> : null}
        <Text><Text dimColor>t</Text><Text color="gray"> edit task  </Text><Text dimColor>esc</Text><Text color="gray"> quit</Text></Text>
      </Box>
    )
  } else {
    const total = minutes * 60
    const elapsed = Math.floor((now.getTime() - pomStartTime.getTime()) / 1000)
    const remaining = Math.max(0, total - elapsed)
    const percent = total > 0 ? Math.min(100, Math.floor((elapsed * 100) / total)) : 0
    const endTime = new Date(pomStartTime.getTime() + minutes * 60 * 1000)
    let barWidth = termWidth - 18
    if (barWidth > 40) barWidth = 40
    if (barWidth < 10) barWidth = 10

    content = (
      <Box flexDirection="column">
        <Text><Text color="gray">{formatTime(pomStartTime)}</Text><Text color="gray"> → </Text><Text color="green">{formatTime(endTime)}</Text></Text>
        <Text> </Text>
        <Text color="cyan" bold>{formatRemaining(remaining)}</Text>
        <Text> </Text>
        <GradientBar percent={percent} width={barWidth} />
        {task ? <><Text> </Text><Text color="gray">{task}</Text></> : null}
        <Text> </Text>
        <Text><Text dimColor>e</Text><Text color="gray"> end early  </Text><Text dimColor>ctrl+c</Text><Text color="gray"> quit</Text></Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text><Text color="#ff87ff" bold>pom</Text>{task ? <Text color="gray">  {task}</Text> : null}</Text>
      <Text> </Text>
      <Box borderStyle="round" borderColor="cyan" paddingX={3} paddingY={1}>
        {content}
      </Box>
    </Box>
  )
}

export function runPomApp(minutes: number, task: string) {
  render(<PomApp initialMinutes={minutes} initialTask={task} />, { exitOnCtrlC: false })
}
