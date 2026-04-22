import { resolve, join, basename } from "path"
import { render, Box, Text } from "ink"
import { run, runArgs } from "../lib/git"
import { findRepos } from "./repos"
import { findWsDir, workspaceRepoDirs, applyRandomTitleBar } from "./workspace"
import { runCreateApp, runAddApp, runRemoveApp, runDeleteApp } from "./app"
import { readFileSync } from "fs"

const home = process.env.HOME!
const presets: Record<string, { source: string; target: string }> = {
  lettuce: {
    source: join(home, "code", "lettuce"),
    target: join(home, "code", "lettuce", "workspaces"),
  },
  wintermuse: {
    source: join(home, "code", "wintermuse"),
    target: join(home, "code", "wintermuse", "workspaces"),
  },
}

function presetNames(): string {
  return Object.keys(presets).sort().join(", ")
}

function Usage() {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text><Text bold>ws</Text> <Text color="gray">workspace manager</Text></Text>
      <Text> </Text>
      <Text><Text color="blue">create</Text><Text color="gray">  ws create [--tmux] {"<"}preset{">"} · ws create [--tmux] {"<"}src{">"} {"<"}dst{">"}</Text></Text>
      <Text><Text color="blue">add</Text><Text color="gray">     ws add · from inside a workspace</Text></Text>
      <Text><Text color="blue">remove</Text><Text color="gray">  ws remove · from inside a workspace</Text></Text>
      <Text><Text color="blue">color</Text><Text color="gray">   ws color · random title bar theme</Text></Text>
      <Text><Text color="blue">delete</Text><Text color="gray">  ws delete {"<"}dir{">"}</Text></Text>
      <Text> </Text>
      <Text><Text color="gray">presets  </Text><Text color="yellow" bold>{presetNames()}</Text></Text>
    </Box>
  )
}

function err(msg: string) {
  render(<Text color="red">{msg}</Text>)
}

function parseCreateArgs(rest: string[]): { useTmux: boolean; pos: string[] } {
  let useTmux = false
  const pos: string[] = []
  for (const a of rest) {
    if (a === "--tmux") useTmux = true
    else pos.push(a)
  }
  return { useTmux, pos }
}

function runCreate(source: string, workspaces: string, useTmux: boolean) {
  const repos = findRepos(source)
  if (repos.length === 0) {
    err("no git repos found in " + source)
    return
  }
  runCreateApp(source, workspaces, repos, useTmux)
}

function runAdd(source: string, wsDir: string) {
  const repos = findRepos(source)
  if (repos.length === 0) {
    err("no git repos found in " + source)
    return
  }
  runAddApp(source, wsDir, repos)
}

function runRemove(source: string, wsDir: string) {
  const repos = workspaceRepoDirs(wsDir)
  if (repos.length === 0) {
    err("no repos in workspace")
    return
  }
  const dirty: string[] = []
  for (const repo of repos) {
    if (run("status --porcelain", join(wsDir, repo))) dirty.push(repo)
  }
  dirty.sort()
  runRemoveApp(source, wsDir, repos, dirty)
}

function hasUnpushedCommits(cwd: string): boolean {
  try {
    return !!runArgs(["log", "@{u}..HEAD", "--oneline"], cwd)
  } catch {
    return true
  }
}

function runDelete(source: string, wsDir: string) {
  const repos = workspaceRepoDirs(wsDir)
  if (repos.length === 0) {
    err("no repos in workspace")
    return
  }
  const dirty: string[] = []
  const unpushed: string[] = []
  for (const repo of repos) {
    const repoDir = join(wsDir, repo)
    if (run("status --porcelain", repoDir)) dirty.push(repo)
    if (hasUnpushedCommits(repoDir)) unpushed.push(repo)
  }
  let msg = `delete workspace ${basename(wsDir)}? (${repos.join(", ")})`
  if (dirty.length > 0 || unpushed.length > 0) {
    msg = "delete anyway?"
  }
  runDeleteApp(source, wsDir, repos, dirty, unpushed, msg)
}

export function wsMain(args: string[]) {
  if (args.length === 0) {
    render(<Usage />)
    process.exit(1)
  }

  const command = args[0]
  const rest = args.slice(1)

  switch (command) {
    case "create": {
      const { useTmux, pos } = parseCreateArgs(rest)
      if (pos.length === 1 && presets[pos[0]]) {
        const p = presets[pos[0]]
        runCreate(p.source, p.target, useTmux)
        return
      }
      if (pos.length === 2) {
        runCreate(resolve(pos[0]), resolve(pos[1]), useTmux)
        return
      }
      render(
        <Box flexDirection="column">
          <Text>usage: ws create [--tmux] {"<"}preset{">"} | ws create [--tmux] {"<"}source_dir{">"} {"<"}target_dir{">"}</Text>
          <Text color="gray">presets: {presetNames()}</Text>
        </Box>,
      )
      process.exit(1)
    }

    case "add": {
      const ws = findWsDir()
      if (!ws) {
        err("not in a workspace directory (no .ws.json found)")
        process.exit(1)
      }
      runAdd(ws.source, ws.wsDir)
      break
    }

    case "remove": {
      const ws = findWsDir()
      if (!ws) {
        err("not in a workspace directory (no .ws.json found)")
        process.exit(1)
      }
      runRemove(ws.source, ws.wsDir)
      break
    }

    case "color": {
      const ws = findWsDir()
      if (!ws) {
        err("not in a workspace directory (no .ws.json found)")
        process.exit(1)
      }
      applyRandomTitleBar(ws.wsDir)
      break
    }

    case "delete": {
      if (rest.length !== 1) {
        err("usage: ws delete <workspace_dir>")
        process.exit(1)
      }
      const wsDir = resolve(rest[0])
      let cfg: { source: string }
      try {
        cfg = JSON.parse(readFileSync(join(wsDir, ".ws.json"), "utf-8"))
      } catch {
        err(`not a workspace directory (no .ws.json in ${wsDir})`)
        process.exit(1)
      }
      runDelete(cfg!.source, wsDir)
      break
    }

    default:
      render(<Usage />)
      process.exit(1)
  }
}
