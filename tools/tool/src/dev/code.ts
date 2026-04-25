import { spawn } from "bun"
import { containerName } from "./paths"
import { containerRunning } from "./docker"

function hexEncode(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function openInEditor(project: string): Promise<number> {
  const cn = containerName(project)
  if (!containerRunning(cn)) {
    throw new Error(`container ${cn} is not running. start it with: dev start ${project}`)
  }

  const hex = hexEncode(cn)
  const folderUri = `vscode-remote://attached-container+${hex}/work`

  const p = spawn(["code", "--folder-uri", folderUri], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  return await p.exited
}
