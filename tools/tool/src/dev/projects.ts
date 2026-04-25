import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { PROJECTS_DIR, projectDir, projectMetaFile, projectComposeFile } from "./paths"

export type ProjectMeta = {
  name: string
  gitUrl?: string
  image: string
  createdAt: string
}

export function listProjects(): string[] {
  if (!existsSync(PROJECTS_DIR)) return []
  return readdirSync(PROJECTS_DIR)
    .filter(name => {
      try {
        return statSync(join(PROJECTS_DIR, name)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
}

export function projectExists(name: string): boolean {
  return existsSync(projectComposeFile(name))
}

export function readMeta(name: string): ProjectMeta {
  const path = projectMetaFile(name)
  if (!existsSync(path)) {
    throw new Error(`project not found: ${name}`)
  }
  return JSON.parse(readFileSync(path, "utf-8"))
}

export function writeMeta(meta: ProjectMeta): void {
  mkdirSync(projectDir(meta.name), { recursive: true })
  writeFileSync(projectMetaFile(meta.name), JSON.stringify(meta, null, 2) + "\n")
}

export function deleteProjectConfig(name: string): void {
  const dir = projectDir(name)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function validProjectName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name) && name.length <= 64
}
