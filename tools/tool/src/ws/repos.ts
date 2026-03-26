import { readdirSync, statSync } from "fs"
import { join } from "path"
import { run, runArgs, runArgsAsync, errorMsg } from "../lib/git"

export function findRepos(sourceDir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(sourceDir) as string[]
  } catch {
    return []
  }
  const repos: string[] = []
  for (const name of entries) {
    if (name === "workspaces" || name === "workspace" || name === ".me") continue
    const full = join(sourceDir, name)
    try {
      if (!statSync(full).isDirectory()) continue
    } catch { continue }
    const gitDir = join(full, ".git")
    try {
      if (statSync(gitDir).isDirectory()) repos.push(name)
    } catch {}
  }
  return repos.sort()
}

export function findTopLevelDirs(repoPath: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(repoPath) as string[]
  } catch {
    return []
  }
  const dirs: string[] = []
  for (const name of entries) {
    if (name.startsWith(".")) continue
    try {
      if (statSync(join(repoPath, name)).isDirectory()) dirs.push(name)
    } catch {}
  }
  return dirs.sort()
}

export function getDefaultBranch(repoPath: string): string {
  const ref = run("symbolic-ref refs/remotes/origin/HEAD", repoPath)
  if (ref) return ref.replace("refs/remotes/origin/", "")
  return "main"
}

export function prepareRepo(repoPath: string, pull: boolean): { ok: boolean; msg: string } {
  const defaultBranch = getDefaultBranch(repoPath)
  let current: string
  try {
    current = runArgs(["rev-parse", "--abbrev-ref", "HEAD"], repoPath)
  } catch {
    return { ok: false, msg: "not a git repo" }
  }
  if (current !== defaultBranch) {
    return { ok: false, msg: `on branch '${current}', expected '${defaultBranch}'` }
  }
  let status: string
  try {
    status = runArgs(["status", "--porcelain"], repoPath)
  } catch {
    return { ok: false, msg: "git status failed" }
  }
  if (status) {
    return { ok: false, msg: "has uncommitted changes" }
  }
  if (pull) {
    try {
      runArgs(["pull", "--rebase"], repoPath)
    } catch (err) {
      return { ok: false, msg: "pull failed: " + errorMsg(err) }
    }
  }
  return { ok: true, msg: "ready" }
}

export async function prepareRepoAsync(repoPath: string, pull: boolean): Promise<{ ok: boolean; msg: string }> {
  const ref = run("symbolic-ref refs/remotes/origin/HEAD", repoPath)
  const defaultBranch = ref ? ref.replace("refs/remotes/origin/", "") : "main"
  let current: string
  try {
    current = await runArgsAsync(["rev-parse", "--abbrev-ref", "HEAD"], repoPath)
  } catch {
    return { ok: false, msg: "not a git repo" }
  }
  if (current !== defaultBranch) {
    return { ok: false, msg: `on branch '${current}', expected '${defaultBranch}'` }
  }
  let status: string
  try {
    status = await runArgsAsync(["status", "--porcelain"], repoPath)
  } catch {
    return { ok: false, msg: "git status failed" }
  }
  if (status) {
    return { ok: false, msg: "has uncommitted changes" }
  }
  if (pull) {
    try {
      await runArgsAsync(["pull", "--rebase"], repoPath)
    } catch (err) {
      return { ok: false, msg: "pull failed: " + errorMsg(err) }
    }
  }
  return { ok: true, msg: "ready" }
}
