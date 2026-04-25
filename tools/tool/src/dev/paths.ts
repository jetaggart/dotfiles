import { join } from "path"

export const HOME = process.env.HOME!
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
