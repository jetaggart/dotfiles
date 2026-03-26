import { resolve, join, basename } from "path"
import { run } from "../lib/git"
import { cyan, gray, yellow, magenta, red, bold, pink } from "../lib/styles"
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
}

function presetNames(): string {
  return Object.keys(presets).sort().join(", ")
}

function printUsage() {
  console.error(
    bold(pink("ws")) + gray(" — workspace manager") + "\n\n" +
    cyan("create") + gray("  ws create [--tmux] <preset>") + magenta(" · ") + gray("ws create [--tmux] <src> <dst>") + "\n" +
    cyan("add") + gray("     ws add") + magenta(" · ") + gray("from inside a workspace") + "\n" +
    cyan("remove") + gray("  ws remove") + magenta(" · ") + gray("from inside a workspace") + "\n" +
    cyan("color") + gray("   ws color") + magenta(" · ") + gray("random title bar theme in .code-workspace") + "\n" +
    cyan("delete") + gray("  ws delete <dir>") + "\n\n" +
    gray("presets  ") + yellow(presetNames()),
  )
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
    console.log(red("no git repos found in " + source))
    return
  }
  runCreateApp(source, workspaces, repos, useTmux)
}

function runAdd(source: string, wsDir: string) {
  const repos = findRepos(source)
  if (repos.length === 0) {
    console.log(red("no git repos found in " + source))
    return
  }
  runAddApp(source, wsDir, repos)
}

function runRemove(source: string, wsDir: string) {
  const repos = workspaceRepoDirs(wsDir)
  if (repos.length === 0) {
    console.log(red("no repos in workspace"))
    return
  }
  const dirty: string[] = []
  for (const repo of repos) {
    if (run("status --porcelain", join(wsDir, repo))) dirty.push(repo)
  }
  dirty.sort()
  runRemoveApp(source, wsDir, repos, dirty)
}

function runDelete(source: string, wsDir: string) {
  const repos = workspaceRepoDirs(wsDir)
  if (repos.length === 0) {
    console.log(red("no repos in workspace"))
    return
  }
  const dirty: string[] = []
  for (const repo of repos) {
    if (run("status --porcelain", join(wsDir, repo))) dirty.push(repo)
  }
  let msg = `delete workspace ${basename(wsDir)}? (${repos.join(", ")})`
  if (dirty.length > 0) {
    msg = "uncommitted changes in: " + dirty.join(", ") + ". delete anyway?"
  }
  runDeleteApp(source, wsDir, repos, dirty, msg)
}

export function wsMain(args: string[]) {
  if (args.length === 0) {
    printUsage()
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
      console.error("usage: ws create [--tmux] <preset> | ws create [--tmux] <source_dir> <target_dir>")
      console.error("presets: " + presetNames())
      process.exit(1)
    }

    case "add": {
      const ws = findWsDir()
      if (!ws) {
        console.error("not in a workspace directory (no .ws.json found)")
        process.exit(1)
      }
      runAdd(ws.source, ws.wsDir)
      break
    }

    case "remove": {
      const ws = findWsDir()
      if (!ws) {
        console.error("not in a workspace directory (no .ws.json found)")
        process.exit(1)
      }
      runRemove(ws.source, ws.wsDir)
      break
    }

    case "color": {
      const ws = findWsDir()
      if (!ws) {
        console.error("not in a workspace directory (no .ws.json found)")
        process.exit(1)
      }
      applyRandomTitleBar(ws.wsDir)
      break
    }

    case "delete": {
      if (rest.length !== 1) {
        console.error("usage: ws delete <workspace_dir>")
        process.exit(1)
      }
      const wsDir = resolve(rest[0])
      let cfg: { source: string }
      try {
        cfg = JSON.parse(readFileSync(join(wsDir, ".ws.json"), "utf-8"))
      } catch {
        console.error(`not a workspace directory (no .ws.json in ${wsDir})`)
        process.exit(1)
      }
      runDelete(cfg!.source, wsDir)
      break
    }

    default:
      printUsage()
      process.exit(1)
  }
}
