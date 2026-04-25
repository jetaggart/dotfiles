import { spawn, spawnSync } from "bun"

export type Result = { code: number; stdout: string; stderr: string }

export function dockerSync(args: string[]): Result {
  const p = spawnSync(["docker", ...args], { stdout: "pipe", stderr: "pipe" })
  return {
    code: p.exitCode,
    stdout: p.stdout.toString(),
    stderr: p.stderr.toString(),
  }
}

export function dockerRequired(args: string[]): string {
  const r = dockerSync(args)
  if (r.code !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${r.stderr.trim()}`)
  }
  return r.stdout.trim()
}

export async function dockerStream(args: string[]): Promise<number> {
  const p = spawn(["docker", ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  return await p.exited
}

export function imageExists(image: string): boolean {
  const r = dockerSync(["image", "inspect", image])
  return r.code === 0
}

export function volumeExists(name: string): boolean {
  const r = dockerSync(["volume", "inspect", name])
  return r.code === 0
}

export function containerExists(name: string): boolean {
  const r = dockerSync(["container", "inspect", name])
  return r.code === 0
}

export function containerRunning(name: string): boolean {
  const r = dockerSync(["container", "inspect", "-f", "{{.State.Running}}", name])
  return r.code === 0 && r.stdout.trim() === "true"
}

export function containerId(name: string): string {
  return dockerRequired(["container", "inspect", "-f", "{{.Id}}", name])
}

export function ensureVolume(name: string): void {
  if (volumeExists(name)) return
  dockerRequired(["volume", "create", name])
}

export async function compose(composeFile: string, args: string[]): Promise<number> {
  return dockerStream(["compose", "-f", composeFile, ...args])
}

export function composeSync(composeFile: string, args: string[]): Result {
  return dockerSync(["compose", "-f", composeFile, ...args])
}
