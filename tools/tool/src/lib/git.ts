export function run(args: string, cwd: string): string {
  const result = Bun.spawnSync(["git", ...args.split(/\s+/)], { cwd })
  return result.stdout.toString().trim()
}

export function runArgs(args: string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], { cwd })
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(stderr || `git ${args[0]} failed with exit code ${result.exitCode}`)
  }
  return result.stdout.toString().trim()
}

export async function runArgsAsync(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stderr: "pipe", stdout: "pipe" })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(stderr.trim() || `git ${args[0]} failed with exit code ${exitCode}`)
  }
  return stdout.trim()
}

export function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
