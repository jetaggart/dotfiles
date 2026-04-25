import { writeFileSync, mkdirSync } from "fs"
import { dirname } from "path"
import { containerName, srcVolume, cacheVolume, projectComposeFile } from "./paths"
import type { ProjectMeta } from "./projects"

export function composeYaml(meta: ProjectMeta, opts: { credsReadOnly: boolean }): string {
  const cn = containerName(meta.name)
  const src = srcVolume(meta.name)
  const cache = cacheVolume(meta.name)
  const credsMode = opts.credsReadOnly ? ":ro" : ""

  const lines = [
    `services:`,
    `  app:`,
    `    image: ${meta.image}`,
    `    container_name: ${cn}`,
    `    hostname: ${meta.name}`,
    `    init: true`,
    `    stdin_open: true`,
    `    tty: true`,
    `    working_dir: /work`,
    `    volumes:`,
    `      - ${src}:/work`,
    `      - ${cache}:/home/dev/.cache`,
    `      - ${meta.credsVolume}:/home/dev/.dev-creds${credsMode}`,
    `    environment:`,
    `      DEV_PROJECT: ${meta.name}`,
    `      DEV_CREDS_DIR: /home/dev/.dev-creds`,
    `    labels:`,
    `      - "dev.tool.project=${meta.name}"`,
    meta.gitUrl ? `      - "dev.tool.git_url=${meta.gitUrl}"` : ``,
    meta.domain ? `      - "dev.tool.domain=${meta.domain}"` : ``,
    ``,
    `volumes:`,
    `  ${src}:`,
    `    name: ${src}`,
    `  ${cache}:`,
    `    name: ${cache}`,
    `  ${meta.credsVolume}:`,
    `    external: true`,
    `    name: ${meta.credsVolume}`,
    ``,
  ]

  return lines.filter(l => l !== ``).join("\n") + "\n"
}

export function writeCompose(meta: ProjectMeta, opts: { credsReadOnly: boolean }): void {
  const path = projectComposeFile(meta.name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, composeYaml(meta, opts))
}
