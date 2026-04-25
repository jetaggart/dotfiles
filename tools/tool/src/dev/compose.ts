import { writeFileSync, mkdirSync, readdirSync, existsSync } from "fs"
import { dirname, join } from "path"
import { containerName, srcVolume, cacheVolume, projectComposeFile, projectSshPort } from "./paths"
import { readGlobalConfig } from "./config"
import type { ProjectMeta } from "./projects"

const HOST_DOTFILES = process.env.DOTFILES ?? join(process.env.HOME!, "code", "dotfiles")
const HOST_HOME = process.env.HOME!
const DOTFILES_BIND_DIRS = ["zsh", "tmux", "claude"]

function listHostPubkeys(): string[] {
  const sshDir = join(HOST_HOME, ".ssh")
  if (!existsSync(sshDir)) return []
  try {
    return readdirSync(sshDir).filter(f => f.endsWith(".pub")).sort()
  } catch {
    return []
  }
}

export function composeYaml(meta: ProjectMeta): string {
  const cn = containerName(meta.name)
  const src = srcVolume(meta.name)
  const cache = cacheVolume(meta.name)
  const creds = readGlobalConfig().credsVolume

  const dotfilesBindMounts = DOTFILES_BIND_DIRS.map(d =>
    `      - ${join(HOST_DOTFILES, d)}:/root/code/dotfiles/${d}:ro`
  )

  const sshKeyMounts = listHostPubkeys().map(f =>
    `      - ${join(HOST_HOME, ".ssh", f)}:/root/.ssh/host_authorized_keys.d/${f}:ro`
  )

  const lines = [
    `name: ${cn}`,
    ``,
    `services:`,
    `  app:`,
    `    image: ${meta.image}`,
    `    container_name: ${cn}`,
    `    hostname: ${meta.name}`,
    `    init: true`,
    `    stdin_open: true`,
    `    tty: true`,
    `    working_dir: /work`,
    `    network_mode: host`,
    `    volumes:`,
    `      - ${src}:/work`,
    `      - ${cache}:/root/.cache`,
    `      - ${creds}:/root/.dev-creds`,
    `      - /var/run/docker.sock:/var/run/docker.sock`,
    ...sshKeyMounts,
    ...dotfilesBindMounts,
    `    environment:`,
    `      DEV_PROJECT: ${meta.name}`,
    `      DEV_CREDS_DIR: /root/.dev-creds`,
    `      SSH_PORT: ${projectSshPort(meta.name)}`,
    `    labels:`,
    `      - "dev.tool.project=${meta.name}"`,
    meta.gitUrl ? `      - "dev.tool.git_url=${meta.gitUrl}"` : ``,
    ``,
    `volumes:`,
    `  ${src}:`,
    `    external: true`,
    `    name: ${src}`,
    `  ${cache}:`,
    `    external: true`,
    `    name: ${cache}`,
    `  ${creds}:`,
    `    external: true`,
    `    name: ${creds}`,
    ``,
  ]

  return lines.filter(l => l !== ``).join("\n") + "\n"
}

export function writeCompose(meta: ProjectMeta): void {
  const path = projectComposeFile(meta.name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, composeYaml(meta))
}
