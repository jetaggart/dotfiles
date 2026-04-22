import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, symlinkSync, lstatSync, rmSync, copyFileSync, existsSync } from "fs"
import { join, basename, dirname, relative, resolve } from "path"
import { runArgs, runArgsAsync } from "../lib/git"
import { randomTheme } from "./themes"

export type FocusMap = Record<string, string[]>

const WS_CONFIG = ".ws.json"
const SYMLINK_DIRS = [".me", ".claude"]

export function focusLabel(dirs: string[]): string {
  if (dirs.includes("*")) return "everything"
  return dirs.join(", ")
}

export function findWsDir(): { source: string; wsDir: string } | null {
  let dir = process.cwd()
  while (true) {
    try {
      const data = readFileSync(join(dir, WS_CONFIG), "utf-8")
      const cfg = JSON.parse(data) as { source: string }
      return { source: cfg.source, wsDir: dir }
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function writeWsConfig(wsDir: string, source: string) {
  writeFileSync(join(wsDir, WS_CONFIG), JSON.stringify({ source }, null, 2) + "\n")
}

export function readFocusDirs(wsDir: string): FocusMap {
  let content: string
  try {
    content = readFileSync(join(wsDir, "CLAUDE.local.md"), "utf-8")
  } catch {
    return {}
  }
  const result: FocusMap = {}

  const re2 = /^- (.+?)\/(.+?)\/$/gm
  let m: RegExpExecArray | null
  while ((m = re2.exec(content)) !== null) {
    if (!result[m[1]]) result[m[1]] = []
    result[m[1]].push(m[2])
  }

  const re1 = /^- ([^/]+?)\/$/gm
  while ((m = re1.exec(content)) !== null) {
    if (!result[m[1]]) result[m[1]] = ["*"]
  }

  return result
}

export function writeFocusConfig(wsDir: string, focus: FocusMap) {
  type Entry = { repo: string; dir: string }
  const entries: Entry[] = []
  const allRepos = Object.keys(focus).sort()

  for (const repo of allRepos) {
    const dirs = focus[repo]
    if (dirs.includes("*")) {
      entries.push({ repo, dir: "" })
    } else {
      for (const d of dirs) entries.push({ repo, dir: d })
    }
  }

  const localPath = join(wsDir, "CLAUDE.local.md")
  if (entries.length === 0) {
    try { rmSync(localPath) } catch {}
    return
  }

  const lines = entries.map(e => e.dir ? `- ${e.repo}/${e.dir}/` : `- ${e.repo}/`)
  const content = `<focus>\nOnly modify files in these directories:\n${lines.join("\n")}\n\nYou may read from any directory in the workspace for context: ${allRepos.join(", ")}\n</focus>\n`
  writeFileSync(localPath, content)

  const folders = entries.map(e => e.dir
    ? { path: join(e.repo, e.dir), name: `${e.repo}/${e.dir}` }
    : { path: e.repo, name: e.repo }
  )

  const theme = randomTheme()
  const wsName = basename(wsDir)
  const hasPython = allRepos.some(repo => {
    const repoDir = join(wsDir, repo)
    return existsSync(join(repoDir, ".venv")) || existsSync(join(repoDir, "pyproject.toml")) || existsSync(join(repoDir, "requirements.txt"))
  })
  const settings: Record<string, unknown> = {
    "window.title": `${wsName} — \${rootName}\${separator}\${appName}`,
    "files.exclude": { "**/.git": true, ".ws.json": true },
    "workbench.colorCustomizations": {
      "titleBar.activeBackground": theme.activeBG,
      "titleBar.activeForeground": theme.activeFG,
      "titleBar.inactiveBackground": theme.inactiveBG,
      "titleBar.inactiveForeground": theme.inactiveFG,
    },
  }
  if (hasPython) {
    settings["python.defaultInterpreterPath"] = "${workspaceFolder}/.venv/bin/python"
    settings["python.analysis.extraPaths"] = []
    settings["python.analysis.autoSearchPaths"] = true
  }
  const wsData = { folders, settings }
  writeFileSync(join(wsDir, `${wsName}.code-workspace`), JSON.stringify(wsData, null, 2) + "\n")
}

export function applyRandomTitleBar(wsDir: string) {
  const path = join(wsDir, `${basename(wsDir)}.code-workspace`)
  const data = JSON.parse(readFileSync(path, "utf-8"))
  if (!data.settings) data.settings = {}
  const theme = randomTheme()
  const cc = data.settings["workbench.colorCustomizations"] ?? {}
  cc["titleBar.activeBackground"] = theme.activeBG
  cc["titleBar.activeForeground"] = theme.activeFG
  cc["titleBar.inactiveBackground"] = theme.inactiveBG
  cc["titleBar.inactiveForeground"] = theme.inactiveFG
  data.settings["workbench.colorCustomizations"] = cc
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
}

function symlinkIgnoredDirs(srcRoot: string, dstRoot: string) {
  const walk = (dir: string) => {
    let entries: string[]
    try { entries = readdirSync(dir) as string[] } catch { return }
    for (const name of entries) {
      const srcPath = join(dir, name)
      try { if (!statSync(srcPath).isDirectory()) continue } catch { continue }
      if (["node_modules", ".git", ".venv", "venv"].includes(name)) continue
      if (SYMLINK_DIRS.includes(name)) {
        const rel = relative(srcRoot, srcPath)
        const dstPath = join(dstRoot, rel)
        try { lstatSync(dstPath) } catch {
          mkdirSync(dirname(dstPath), { recursive: true })
          symlinkSync(srcPath, dstPath)
        }
      } else {
        walk(srcPath)
      }
    }
  }
  walk(srcRoot)
}

export async function createWorktreeAsync(repoPath: string, dest: string, branch: string) {
  try {
    await runArgsAsync(["worktree", "add", dest, "-b", branch], repoPath)
  } catch {
    await runArgsAsync(["worktree", "add", dest, branch], repoPath)
  }

  const bootstrapDirs = ["node_modules", ".venv", "venv"]
  const bootstrapFiles = [".env", ".env.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".env.production", ".env.production.local", "pyrightconfig.json"]

  for (const dir of bootstrapDirs) {
    const src = join(repoPath, dir)
    const dst = join(dest, dir)
    try { statSync(src) } catch { continue }
    try { statSync(dst); continue } catch {}
    const proc = Bun.spawn(["cp", "-a", src, dst])
    await proc.exited
  }

  for (const file of bootstrapFiles) {
    const src = join(repoPath, file)
    const dst = join(dest, file)
    try { statSync(src) } catch { continue }
    try { statSync(dst); continue } catch {}
    try { copyFileSync(src, dst) } catch {}
  }

  symlinkIgnoredDirs(repoPath, dest)
}

export function isExistingWorkspaceWorktree(parentRepo: string, dest: string, wsBranch: string): boolean {
  try { lstatSync(join(dest, ".git")) } catch { return false }
  let listOut: string
  try { listOut = runArgs(["worktree", "list", "--porcelain"], parentRepo) } catch { return false }
  const want = resolve(dest)
  for (const line of listOut.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("worktree ")) continue
    const p = trimmed.slice("worktree ".length).trim()
    if (resolve(p) !== want) continue
    try {
      const cur = runArgs(["rev-parse", "--abbrev-ref", "HEAD"], dest)
      return cur === wsBranch
    } catch { return false }
  }
  return false
}

export function removeOneWorktree(wsDir: string, source: string, repo: string) {
  const repoDir = join(wsDir, repo)
  const parentRepo = join(source, repo)
  let isGitRepo = false
  try {
    isGitRepo = statSync(join(parentRepo, ".git")).isDirectory()
  } catch {}
  if (isGitRepo) {
    runArgs(["worktree", "remove", repoDir, "--force"], parentRepo)
  } else {
    rmSync(repoDir, { recursive: true })
  }
}

const WS_NON_REPO = new Set([WS_CONFIG, "CLAUDE.md", "CLAUDE.local.md", ...SYMLINK_DIRS])

export function workspaceRepoDirs(wsDir: string): string[] {
  let entries: string[]
  try { entries = readdirSync(wsDir) as string[] } catch { return [] }
  const repos: string[] = []
  for (const name of entries) {
    if (WS_NON_REPO.has(name) || name.endsWith(".code-workspace")) continue
    try { if (statSync(join(wsDir, name)).isDirectory()) repos.push(name) } catch {}
  }
  return repos.sort()
}

export function listLeftovers(dir: string): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) as string[] } catch { return [] }
  const items: string[] = []
  for (const name of entries) {
    try {
      items.push(statSync(join(dir, name)).isDirectory() ? name + "/" : name)
    } catch {
      items.push(name)
    }
  }
  return items.sort()
}
