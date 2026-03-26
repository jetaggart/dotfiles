import { useState, useEffect, type ReactNode } from "react"
import { render, Box, Text, useInput, useApp } from "ink"
import { Spinner, MultiSelect, Select, TextInput, ConfirmInput } from "@inkjs/ui"
import { findTopLevelDirs, prepareRepoAsync } from "./repos"
import {
  type FocusMap,
  focusLabel,
  writeWsConfig,
  writeFocusConfig,
  readFocusDirs,
  createWorktreeAsync,
  isExistingWorkspaceWorktree,
  removeOneWorktree,
  listLeftovers,
} from "./workspace"
import { join, basename } from "path"
import { mkdirSync, statSync, symlinkSync, lstatSync, rmSync } from "fs"

type WtreeResult = { repo: string; ok: boolean; msg: string }

type Step =
  | "pickRepos"
  | "confirmPull"
  | "checking"
  | "checkFailed"
  | "name"
  | "focus"
  | "building"
  | "summary"

type AsyncStatus = { phase: string; detail: string }

function ResultLine({ result }: { result: WtreeResult }) {
  if (result.ok) {
    return <Text><Text color="green">✓ </Text>{result.repo}<Text color="magenta"> → </Text><Text color="gray">{result.msg}</Text></Text>
  }
  return <Text><Text color="red">✗ </Text>{result.repo}<Text color="magenta"> → </Text><Text color="red">{result.msg}</Text></Text>
}

function Banner({ action, subtitle }: { action: string; subtitle: string }) {
  return (
    <Text>
      <Text color="#ff87ff" bold>ws</Text> <Text color="cyan">{action}</Text>
      {subtitle ? <Text color="gray">  {subtitle}</Text> : null}
    </Text>
  )
}

function History({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return <Text color="gray">{items.join(" · ")}</Text>
}

function Summary({ lines, onExit }: { lines: ReactNode[]; onExit: () => void }) {
  useInput((_input, key) => {
    if (key.return) onExit()
  })
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="green" paddingX={1} flexDirection="column">
        {lines.map((line, i) => <Box key={i}>{typeof line === "string" ? <Text>{line}</Text> : line}</Box>)}
      </Box>
      <Text color="gray">enter · exit</Text>
    </Box>
  )
}

function AsyncPanel({ title, status }: { title: string; status: AsyncStatus }) {
  return (
    <Box borderStyle="round" borderColor="blue" paddingX={1} flexDirection="column">
      <Box>
        <Spinner label={" "} />
        <Text bold>{title}</Text>
      </Box>
      <Text> </Text>
      <Text><Text color="magenta">now </Text><Text color="cyan">{status.phase}</Text></Text>
      <Text color="gray">{status.detail}</Text>
    </Box>
  )
}

function CheckFailed({ issues, onExit }: { issues: string[]; onExit: () => void }) {
  useInput(() => onExit())
  return (
    <Box flexDirection="column">
      {issues.map((issue, idx) => <Text key={idx} color="red">{issue}</Text>)}
      <Text color="red">fix the issues above and try again</Text>
      <Text color="gray">any key · exit</Text>
    </Box>
  )
}

interface CreateAppProps {
  source: string
  workspaces: string
  repos: string[]
  useTmux: boolean
}

function CreateApp({ source, workspaces, repos, useTmux }: CreateAppProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>("pickRepos")
  const [history, setHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [issues, setIssues] = useState<string[]>([])
  const [wsName, setWsName] = useState("")
  const [focus, setFocus] = useState<FocusMap>({})
  const [focusQueue, setFocusQueue] = useState<string[]>([])
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatus>({ phase: "…", detail: "starting" })
  const [summaryLines, setSummaryLines] = useState<ReactNode[]>([])
  const [exitSummary, setExitSummary] = useState("")

  useEffect(() => {
    if (exitSummary) {
      console.log(exitSummary)
      exit()
    }
  }, [exitSummary])

  const addHistory = (item: string) => setHistory(h => [...h, item])

  const startChecking = (sel: string[], pull: boolean) => {
    setStep("checking")
    const issues: string[] = []
    const n = sel.length
    ;(async () => {
      for (let i = 0; i < n; i++) {
        setAsyncStatus({ phase: "verify repository", detail: `[${i + 1}/${n}]  ${sel[i]}  ·  default branch · clean tree` })
        const result = await prepareRepoAsync(join(source, sel[i]), pull)
        if (!result.ok) issues.push(`${sel[i]}: ${result.msg}`)
      }
      if (issues.length > 0) {
        setIssues(issues)
        setStep("checkFailed")
      } else {
        addHistory("repos checked")
        setStep("name")
      }
    })()
  }

  const startFocusFlow = (sel: string[], name: string) => {
    const queue: string[] = []
    const newFocus: FocusMap = { ...focus }
    for (const repo of sel) {
      const dirs = findTopLevelDirs(join(source, repo))
      if (dirs.length === 0) {
        newFocus[repo] = ["*"]
        addHistory(`${repo}: everything`)
      } else {
        queue.push(repo)
      }
    }
    setFocus(newFocus)
    if (queue.length === 0) {
      startBuilding(newFocus, sel, name)
    } else {
      setFocusQueue(queue)
      setStep("focus")
    }
  }

  const SYMLINK_DIRS = [".me", ".claude"]

  const startBuilding = (fm: FocusMap, sel: string[], name: string) => {
    setStep("building")
    ;(async () => {
      const wsDir = join(workspaces, name)
      const buildResults: WtreeResult[] = []
      setAsyncStatus({ phase: "layout", detail: "mkdir  " + wsDir })
      mkdirSync(wsDir, { recursive: true })

      setAsyncStatus({ phase: "config", detail: "write  .ws.json  ·  source → " + source })
      writeWsConfig(wsDir, source)

      const claudeMd = join(source, "CLAUDE.md")
      try {
        statSync(claudeMd)
        setAsyncStatus({ phase: "symlinks", detail: "CLAUDE.md  →  " + join(wsDir, "CLAUDE.md") })
        symlinkSync(claudeMd, join(wsDir, "CLAUDE.md"))
      } catch {}

      setAsyncStatus({ phase: "symlinks", detail: ".me / .claude  (when present in source)" })
      for (const dir of SYMLINK_DIRS) {
        const src = join(source, dir)
        const dst = join(wsDir, dir)
        try { statSync(src) } catch { continue }
        try { lstatSync(dst); continue } catch {}
        symlinkSync(src, dst)
      }

      const n = sel.length
      for (let i = 0; i < n; i++) {
        const repo = sel[i]
        setAsyncStatus({ phase: "git worktrees", detail: `[${i + 1}/${n}]  worktree add  ·  ${repo}` })
        try {
          await createWorktreeAsync(join(source, repo), join(wsDir, repo), name)
          buildResults.push({ repo, ok: true, msg: "focus: " + focusLabel(fm[repo]) })
        } catch (err) {
          buildResults.push({ repo, ok: false, msg: err instanceof Error ? err.message : String(err) })
        }
      }

      setAsyncStatus({ phase: "focus & workspace file", detail: "CLAUDE.local.md  ·  " + basename(wsDir) + ".code-workspace" })
      writeFocusConfig(wsDir, fm)

      const lines: ReactNode[] = [
        <Text bold>workspace ready</Text>,
        <Text color="cyan">{wsDir}</Text>,
        <Text> </Text>,
        ...buildResults.map(r => <ResultLine key={r.repo} result={r} />),
      ]

      if (useTmux && process.env.TMUX) {
        Bun.spawnSync(["tmux", "new-window", "-c", wsDir, "-n", name])
        lines.push(<Text> </Text>, <Text><Text color="green">tmux </Text><Text color="gray">new window </Text><Text color="cyan">{name}</Text></Text>)
      } else {
        lines.push(<Text> </Text>, <Text><Text color="gray">cd </Text><Text color="cyan">{wsDir}</Text></Text>)
      }

      setSummaryLines(lines)
      setStep("summary")
    })()
  }

  if (step === "pickRepos") {
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <MultiSelect
          options={repos.map(r => ({ label: r, value: r }))}
          onSubmit={(values) => {
            const sel = values.sort()
            setSelected(sel)
            addHistory("repos: " + sel.join(", "))
            setStep("confirmPull")
          }}
        />
      </Box>
    )
  }

  if (step === "confirmPull") {
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <Text>pull latest with git pull --rebase?</Text>
        <ConfirmInput
          defaultChoice="confirm"
          onConfirm={() => {
            addHistory("pull: yes")
            startChecking(selected, true)
          }}
          onCancel={() => {
            addHistory("pull: no")
            startChecking(selected, false)
          }}
        />
      </Box>
    )
  }

  if (step === "checking" || step === "building") {
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <AsyncPanel title={step === "checking" ? "checking repositories" : "creating workspace"} status={asyncStatus} />
      </Box>
    )
  }

  if (step === "checkFailed") {
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <CheckFailed issues={issues} onExit={() => exit()} />
      </Box>
    )
  }

  if (step === "name") {
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <Box>
          <Text>Workspace name: </Text>
          <TextInput
            onSubmit={(value) => {
              const name = value.trim()
              if (!name) return
              setWsName(name)
              addHistory("name: " + name)
              startFocusFlow(selected, name)
            }}
          />
        </Box>
      </Box>
    )
  }

  if (step === "focus" && focusQueue.length > 0) {
    const repo = focusQueue[0]
    const dirs = findTopLevelDirs(join(source, repo))
    const options = [{ label: "everything", value: "everything" }, ...dirs.map(d => ({ label: d, value: d }))]
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <Text>{repo + ": focus directories"}</Text>
        <MultiSelect
          options={options}
          onSubmit={(values) => {
            const vals = values.map(v => v === "everything" ? "*" : v)
            const newFocus = { ...focus, [repo]: vals.includes("*") ? ["*"] : vals }
            setFocus(newFocus)
            addHistory(`${repo}: ${focusLabel(newFocus[repo])}`)
            const remaining = focusQueue.slice(1)
            if (remaining.length === 0) {
              setFocusQueue([])
              startBuilding(newFocus, selected, wsName)
            } else {
              setFocusQueue(remaining)
            }
          }}
        />
      </Box>
    )
  }

  if (step === "summary") {
    return (
      <Box flexDirection="column">
        <Banner action="create workspace" subtitle={workspaces} />
        <History items={history} />
        <Summary
          lines={summaryLines}
          onExit={() => {
            const wsDir = join(workspaces, wsName)
            setExitSummary(`created workspace ${wsName}: ${wsDir}`)
          }}
        />
      </Box>
    )
  }

  return null
}

interface AddAppProps {
  source: string
  wsDir: string
  repos: string[]
}

function AddApp({ source, wsDir, repos }: AddAppProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>("pickRepos")
  const [history, setHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [focus, setFocus] = useState<FocusMap>({})
  const [focusQueue, setFocusQueue] = useState<string[]>([])
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatus>({ phase: "…", detail: "starting" })
  const [summaryLines, setSummaryLines] = useState<ReactNode[]>([])
  const [exitSummary, setExitSummary] = useState("")
  const [issues, setIssues] = useState<string[]>([])

  useEffect(() => {
    if (exitSummary) {
      console.log(exitSummary)
      exit()
    }
  }, [exitSummary])

  const addHistory = (item: string) => setHistory(h => [...h, item])
  const wsBranch = basename(wsDir)

  const startChecking = (sel: string[], pull: boolean) => {
    setStep("checking")
    const foundIssues: string[] = []
    ;(async () => {
      for (let i = 0; i < sel.length; i++) {
        setAsyncStatus({ phase: "verify repository", detail: `[${i + 1}/${sel.length}]  ${sel[i]}` })
        const result = await prepareRepoAsync(join(source, sel[i]), pull)
        if (!result.ok) foundIssues.push(`${sel[i]}: ${result.msg}`)
      }
      if (foundIssues.length > 0) {
        setIssues(foundIssues)
        setStep("checkFailed")
      } else {
        addHistory("repos checked")
        startFocusFlow(sel)
      }
    })()
  }

  const startFocusFlow = (sel: string[]) => {
    const queue: string[] = []
    const newFocus: FocusMap = { ...focus }
    for (const repo of sel) {
      const dirs = findTopLevelDirs(join(source, repo))
      if (dirs.length === 0) {
        newFocus[repo] = ["*"]
        addHistory(`${repo}: everything`)
      } else {
        queue.push(repo)
      }
    }
    setFocus(newFocus)
    if (queue.length === 0) {
      startAddBuild(newFocus, sel)
    } else {
      setFocusQueue(queue)
      setStep("focus")
    }
  }

  const startAddBuild = (fm: FocusMap, sel: string[]) => {
    setStep("building")
    ;(async () => {
      const buildResults: WtreeResult[] = []
      for (let i = 0; i < sel.length; i++) {
        const repo = sel[i]
        setAsyncStatus({ phase: "git worktree", detail: `[${i + 1}/${sel.length}]  add  ·  branch ${wsBranch}  ·  ${repo}` })
        const dest = join(wsDir, repo)
        let reused = false
        try {
          await createWorktreeAsync(join(source, repo), dest, wsBranch)
        } catch {
          if (isExistingWorkspaceWorktree(join(source, repo), dest, wsBranch)) {
            reused = true
          } else {
            buildResults.push({ repo, ok: false, msg: "worktree add failed" })
            continue
          }
        }
        let msg = "focus: " + focusLabel(fm[repo])
        if (reused) msg = "worktree already present, " + msg
        buildResults.push({ repo, ok: true, msg })
      }

      setAsyncStatus({ phase: "focus & workspace file", detail: "merge CLAUDE.local.md  ·  " + basename(wsDir) + ".code-workspace" })
      const merged = readFocusDirs(wsDir)
      for (const r of buildResults) {
        if (!r.ok) continue
        merged[r.repo] = fm[r.repo]
      }
      writeFocusConfig(wsDir, merged)

      const lines: ReactNode[] = [
        <Text bold>added to workspace</Text>,
        <Text color="cyan">{wsDir}</Text>,
        <Text> </Text>,
        ...buildResults.map(r => <ResultLine key={r.repo} result={r} />),
        <Text> </Text>,
        <Text><Text color="gray">cd </Text><Text color="cyan">{wsDir}</Text></Text>,
      ]
      setSummaryLines(lines)
      setStep("summary")
    })()
  }

  if (step === "pickRepos") {
    return (
      <Box flexDirection="column">
        <Banner action="add repositories" subtitle={wsDir} />
        <History items={history} />
        <MultiSelect
          options={repos.map(r => ({ label: r, value: r }))}
          onSubmit={(values) => {
            const sel = values.sort()
            setSelected(sel)
            addHistory("repos: " + sel.join(", "))
            setStep("confirmPull")
          }}
        />
      </Box>
    )
  }

  if (step === "confirmPull") {
    return (
      <Box flexDirection="column">
        <Banner action="add repositories" subtitle={wsDir} />
        <History items={history} />
        <Text>pull latest with git pull --rebase?</Text>
        <ConfirmInput
          defaultChoice="confirm"
          onConfirm={() => { addHistory("pull: yes"); startChecking(selected, true) }}
          onCancel={() => { addHistory("pull: no"); startChecking(selected, false) }}
        />
      </Box>
    )
  }

  if (step === "checking" || step === "building") {
    return (
      <Box flexDirection="column">
        <Banner action="add repositories" subtitle={wsDir} />
        <History items={history} />
        <AsyncPanel title={step === "checking" ? "checking repositories" : "adding repositories"} status={asyncStatus} />
      </Box>
    )
  }

  if (step === "checkFailed") {
    return (
      <Box flexDirection="column">
        <Banner action="add repositories" subtitle={wsDir} />
        <History items={history} />
        <CheckFailed issues={issues} onExit={() => exit()} />
      </Box>
    )
  }

  if (step === "focus" && focusQueue.length > 0) {
    const repo = focusQueue[0]
    const dirs = findTopLevelDirs(join(source, repo))
    const options = [{ label: "everything", value: "everything" }, ...dirs.map(d => ({ label: d, value: d }))]
    return (
      <Box flexDirection="column">
        <Banner action="add repositories" subtitle={wsDir} />
        <History items={history} />
        <Text>{repo + ": focus directories"}</Text>
        <MultiSelect
          options={options}
          onSubmit={(values) => {
            const vals = values.map(v => v === "everything" ? "*" : v)
            const newFocus = { ...focus, [repo]: vals.includes("*") ? ["*"] : vals }
            setFocus(newFocus)
            addHistory(`${repo}: ${focusLabel(newFocus[repo])}`)
            const remaining = focusQueue.slice(1)
            if (remaining.length === 0) {
              setFocusQueue([])
              startAddBuild(newFocus, selected)
            } else {
              setFocusQueue(remaining)
            }
          }}
        />
      </Box>
    )
  }

  if (step === "summary") {
    return (
      <Box flexDirection="column">
        <Banner action="add repositories" subtitle={wsDir} />
        <History items={history} />
        <Summary lines={summaryLines} onExit={() => { setExitSummary(`added ${selected.join(", ")} → ${wsDir}`) }} />
      </Box>
    )
  }

  return null
}

interface RemoveAppProps {
  source: string
  wsDir: string
  repos: string[]
  dirty: string[]
}

function RemoveApp({ source, wsDir, repos, dirty }: RemoveAppProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<"pick" | "confirm" | "working" | "summary">("pick")
  const [history] = useState<string[]>([])
  const [target, setTarget] = useState("")
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatus>({ phase: "…", detail: "starting" })
  const [summaryLines, setSummaryLines] = useState<ReactNode[]>([])

  if (step === "pick") {
    const options = repos.map(r => ({
      label: r + (dirty.includes(r) ? "  ⚠ uncommitted" : ""),
      value: r,
    }))
    return (
      <Box flexDirection="column">
        <Banner action="remove repository" subtitle={wsDir} />
        <History items={history} />
        <Select options={options} onChange={(value) => { setTarget(value); setStep("confirm") }} />
      </Box>
    )
  }

  if (step === "confirm") {
    return (
      <Box flexDirection="column">
        <Banner action="remove repository" subtitle={wsDir} />
        <History items={history} />
        <Text>Remove {target} from workspace?</Text>
        <ConfirmInput
          defaultChoice="cancel"
          onConfirm={() => {
            setStep("working")
            setAsyncStatus({ phase: "git worktree remove", detail: target })
            ;(async () => {
              try {
                removeOneWorktree(wsDir, source, target)
                const fm = readFocusDirs(wsDir)
                delete fm[target]
                writeFocusConfig(wsDir, fm)
                setSummaryLines([
                  <Text bold>removed</Text>,
                  <Text color="green">{target}</Text>,
                  <Text> </Text>,
                  <Text><Text color="gray">cd </Text><Text color="cyan">{wsDir}</Text></Text>,
                ])
              } catch (err) {
                setSummaryLines([
                  <Text color="red">{err instanceof Error ? err.message : String(err)}</Text>,
                  <Text> </Text>,
                  <Text><Text color="gray">cd </Text><Text color="cyan">{wsDir}</Text></Text>,
                ])
              }
              setStep("summary")
            })()
          }}
          onCancel={() => exit()}
        />
      </Box>
    )
  }

  if (step === "working") {
    return (
      <Box flexDirection="column">
        <Banner action="remove repository" subtitle={wsDir} />
        <History items={history} />
        <AsyncPanel title={"removing " + target} status={asyncStatus} />
      </Box>
    )
  }

  if (step === "summary") {
    return (
      <Box flexDirection="column">
        <Banner action="remove repository" subtitle={wsDir} />
        <History items={history} />
        <Summary lines={summaryLines} onExit={() => exit()} />
      </Box>
    )
  }

  return null
}

interface DeleteAppProps {
  source: string
  wsDir: string
  repos: string[]
  dirty: string[]
  confirmMsg: string
}

function DeleteApp({ source, wsDir, repos, dirty, confirmMsg }: DeleteAppProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<"confirm" | "working" | "forceConfirm" | "forceWorking" | "summary">("confirm")
  const [asyncStatus, setAsyncStatus] = useState<AsyncStatus>({ phase: "…", detail: "starting" })
  const [delResults, setDelResults] = useState<WtreeResult[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [summaryLines, setSummaryLines] = useState<ReactNode[]>([])
  const [forceLines, setForceLines] = useState<string[]>([])

  const doDelete = () => {
    setStep("working")
    ;(async () => {
      const results: WtreeResult[] = []
      const failedRepos: string[] = []
      for (const repo of repos) {
        setAsyncStatus({ phase: "git worktree remove --force", detail: repo })
        const parentRepo = join(source, repo)
        try {
          statSync(join(parentRepo, ".git"))
          const result = Bun.spawnSync(["git", "worktree", "remove", join(wsDir, repo), "--force"], { cwd: parentRepo })
          if (result.exitCode !== 0) {
            failedRepos.push(repo)
          } else {
            results.push({ repo, ok: true, msg: "removed" })
          }
        } catch {
          rmSync(join(wsDir, repo), { recursive: true, force: true })
          results.push({ repo, ok: true, msg: "removed" })
        }
      }
      setDelResults(results)
      setFailed(failedRepos)
      if (failedRepos.length > 0) {
        const lines = ["could not cleanly remove:"]
        for (const repo of failedRepos) {
          lines.push("  " + repo + ":")
          for (const l of listLeftovers(join(wsDir, repo))) {
            lines.push("    " + l)
          }
        }
        setForceLines(lines)
        setStep("forceConfirm")
      } else {
        finishDelete(results)
      }
    })()
  }

  const doForceDelete = () => {
    setStep("forceWorking")
    ;(async () => {
      const newResults = [...delResults]
      for (const repo of failed) {
        setAsyncStatus({ phase: "rm + git worktree prune", detail: repo })
        rmSync(join(wsDir, repo), { recursive: true, force: true })
        const parentRepo = join(source, repo)
        try {
          statSync(join(parentRepo, ".git"))
          Bun.spawnSync(["git", "worktree", "prune"], { cwd: parentRepo })
        } catch {}
        newResults.push({ repo, ok: true, msg: "force removed" })
      }
      setDelResults(newResults)
      finishDelete(newResults)
    })()
  }

  const finishDelete = (results: WtreeResult[]) => {
    rmSync(wsDir, { recursive: true, force: true })
    setSummaryLines([
      <Text bold>delete complete</Text>,
      <Text> </Text>,
      ...results.map(r => <ResultLine key={r.repo} result={r} />),
    ])
    setStep("summary")
  }

  if (step === "confirm") {
    return (
      <Box flexDirection="column">
        <Banner action="delete workspace" subtitle={basename(wsDir)} />
        {dirty.length > 0 && <Text color="yellow">uncommitted changes in: {dirty.join(", ")}</Text>}
        <Text>{confirmMsg}</Text>
        <ConfirmInput
          defaultChoice="cancel"
          onConfirm={() => doDelete()}
          onCancel={() => exit()}
        />
      </Box>
    )
  }

  if (step === "working" || step === "forceWorking") {
    return (
      <Box flexDirection="column">
        <Banner action="delete workspace" subtitle={basename(wsDir)} />
        <AsyncPanel title={step === "working" ? "removing worktrees" : "force removing leftovers"} status={asyncStatus} />
      </Box>
    )
  }

  if (step === "forceConfirm") {
    return (
      <Box flexDirection="column">
        <Banner action="delete workspace" subtitle={basename(wsDir)} />
        {forceLines.map((l, i) => <Text key={i} color="yellow">{l}</Text>)}
        <Text> </Text>
        <Text>force remove these directories?</Text>
        <ConfirmInput
          defaultChoice="cancel"
          onConfirm={() => doForceDelete()}
          onCancel={() => {
            const lines: ReactNode[] = [
              <Text color="red">aborted — workspace partially deleted</Text>,
              ...delResults.map(r => <ResultLine key={r.repo} result={r} />),
              ...failed.map(repo => <Text key={repo}><Text color="yellow">! </Text>{repo}<Text color="gray"> · skipped</Text></Text>),
            ]
            setSummaryLines(lines)
            setStep("summary")
          }}
        />
      </Box>
    )
  }

  if (step === "summary") {
    return (
      <Box flexDirection="column">
        <Banner action="delete workspace" subtitle={basename(wsDir)} />
        <Summary lines={summaryLines} onExit={() => exit()} />
      </Box>
    )
  }

  return null
}

export function runCreateApp(source: string, workspaces: string, repos: string[], useTmux: boolean) {
  render(<CreateApp source={source} workspaces={workspaces} repos={repos} useTmux={useTmux} />)
}

export function runAddApp(source: string, wsDir: string, repos: string[]) {
  render(<AddApp source={source} wsDir={wsDir} repos={repos} />)
}

export function runRemoveApp(source: string, wsDir: string, repos: string[], dirty: string[]) {
  render(<RemoveApp source={source} wsDir={wsDir} repos={repos} dirty={dirty} />)
}

export function runDeleteApp(source: string, wsDir: string, repos: string[], dirty: string[], confirmMsg: string) {
  render(<DeleteApp source={source} wsDir={wsDir} repos={repos} dirty={dirty} confirmMsg={confirmMsg} />)
}
