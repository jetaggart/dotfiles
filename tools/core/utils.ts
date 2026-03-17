import { execFile, execSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, stdio: "pipe" }).toString().trim();
}

export async function gitAsync(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.toString().trim();
}

export function errorMsg(e: any): string {
  return e.stderr?.toString().trim() || e.message || "unknown error";
}
