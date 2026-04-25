import { join } from "path"

const HOME = process.env.HOME!
export const CONFIG_DIR = join(HOME, ".config", "dev")
export const PROJECTS_DIR = join(CONFIG_DIR, "projects")
export const GLOBAL_CONFIG = join(CONFIG_DIR, "config.json")

export const DEFAULT_BASE_IMAGE = "dev-base:latest"
export const DEFAULT_CREDS_VOLUME = "dev-creds"

export function projectDir(name: string): string {
  return join(PROJECTS_DIR, name)
}

export function projectComposeFile(name: string): string {
  return join(projectDir(name), "compose.yaml")
}

export function projectMetaFile(name: string): string {
  return join(projectDir(name), "project.json")
}

export function containerName(project: string): string {
  return `dev-${project}`
}

export function srcVolume(project: string): string {
  return `${project}-src`
}

export function cacheVolume(project: string): string {
  return `${project}-cache`
}

export function projectSshPort(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  return 22000 + (Math.abs(hash) % 1000)
}
