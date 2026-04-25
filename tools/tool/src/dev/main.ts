import { mkdirSync } from "fs"
import { spawnSync } from "bun"
import {
  PROJECTS_DIR,
  projectComposeFile,
  containerName,
  srcVolume,
  cacheVolume,
  projectSshPort,
} from "./paths"
import { readGlobalConfig, writeGlobalConfig } from "./config"
import {
  listProjects,
  projectExists,
  readMeta,
  writeMeta,
  deleteProjectConfig,
  validProjectName,
  type ProjectMeta,
} from "./projects"
import { writeCompose } from "./compose"
import {
  dockerSync,
  dockerStream,
  compose,
  imageExists,
  volumeExists,
  ensureVolume,
  containerExists,
  containerRunning,
} from "./docker"
import { runAuth } from "./auth"
import { openInEditor } from "./code"

function usage(): never {
  console.error(`usage: dev <command> [args...]

projects:
  create <name> [git-url] [--image <img>]   create a project
  list                                       list projects
  start <name>                               start container
  stop <name>                                stop container
  shell <name>                               ssh into container (real pty, smooth TUI)
  enter <name>                               docker exec into container (escape hatch)
  exec <name> -- <cmd...>                    run command in container
  claude <name>                              run claude in container
  code <name>                                open in vscode (remote)
  cursor <name>                              open in cursor (remote)
  nuke <name> [--yes]                        full wipe: container + volumes
  rebuild <name>                             recreate container, keep volumes

setup:
  init                                       bootstrap: build-image + auth
  auth [--from-scratch]                      refresh creds volume (reuses existing keys unless --from-scratch)
  build-image                                build dev-base image
  doctor                                     check setup health

backups:
  backup <name> <out.tar.gz>                 snapshot source volume
  restore <name> <in.tar.gz>                 restore source volume

config:
  config                                     show all
  config get <key>                           read (baseImage, credsVolume)
  config set <key> <value>                   write
`)
  process.exit(1)
}

function err(msg: string): never {
  console.error(`error: ${msg}`)
  process.exit(1)
}

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--") {
      positional.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith("--")) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

function splitDoubleDash(args: string[]): { before: string[]; after: string[] } {
  const idx = args.indexOf("--")
  if (idx === -1) return { before: args, after: [] }
  return { before: args.slice(0, idx), after: args.slice(idx + 1) }
}

function resolveProject(arg: string | undefined): string {
  if (arg) return arg
  const envProject = process.env.DEV_PROJECT
  if (envProject) return envProject
  err("no project specified. pass <name> or set DEV_PROJECT")
}

function takeProject(args: string[]): { name: string; rest: string[] } {
  if (args[0]) return { name: args[0], rest: args.slice(1) }
  const env = process.env.DEV_PROJECT
  if (env) return { name: env, rest: args }
  err("no project specified. pass <name> or set DEV_PROJECT")
}

async function cmdCreate(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args)
  const [name, gitUrl] = positional
  if (!name) err("usage: dev create <name> [git-url]")
  if (!validProjectName(name)) err(`invalid project name: ${name}`)
  if (projectExists(name)) err(`project already exists: ${name}`)

  const cfg = readGlobalConfig()
  if (!imageExists(cfg.baseImage)) err(`base image '${cfg.baseImage}' not built. run: dev init`)
  if (!volumeExists(cfg.credsVolume)) err(`creds volume '${cfg.credsVolume}' missing. run: dev auth`)

  const image = typeof flags.image === "string" ? flags.image : cfg.baseImage

  const meta: ProjectMeta = {
    name,
    gitUrl,
    image,
    createdAt: new Date().toISOString(),
  }

  mkdirSync(PROJECTS_DIR, { recursive: true })
  writeMeta(meta)
  writeCompose(meta)

  ensureVolume(srcVolume(name))
  ensureVolume(cacheVolume(name))

  console.log(`starting container ${containerName(name)}`)
  const composeFile = projectComposeFile(name)
  const upCode = await compose(composeFile, ["up", "-d"])
  if (upCode !== 0) err(`failed to start container`)

  if (gitUrl) {
    console.log(`cloning ${gitUrl}`)
    const cloneCode = await dockerStream([
      "exec", "-it", containerName(name),
      "bash", "-lc",
      `if [ -z "$(ls -A /work 2>/dev/null)" ]; then git clone "${gitUrl}" /work; else echo "/work not empty, skipping clone"; fi`
    ])
    if (cloneCode !== 0) {
      console.error(`warning: clone failed (exit ${cloneCode}). you can run it manually with: dev shell ${name}`)
    }
  }

  console.log(`ready: dev shell ${name}`)
}

function cmdList(): void {
  const projects = listProjects()
  if (projects.length === 0) {
    console.log("no projects. create one with: dev create <name> [git-url]")
    return
  }
  for (const name of projects) {
    let meta: ProjectMeta
    try {
      meta = readMeta(name)
    } catch {
      console.log(`${name}  (broken: missing project.json)`)
      continue
    }
    const cn = containerName(name)
    const status = containerRunning(cn) ? "running" : containerExists(cn) ? "stopped" : "absent"
    const url = meta.gitUrl ? `  ${meta.gitUrl}` : ""
    console.log(`${name.padEnd(24)}${status.padEnd(10)}${url}`)
  }
}

async function cmdStart(args: string[]): Promise<void> {
  const name = resolveProject(args[0])
  if (!projectExists(name)) err(`project not found: ${name}`)
  ensureVolume(srcVolume(name))
  ensureVolume(cacheVolume(name))
  const code = await compose(projectComposeFile(name), ["up", "-d"])
  if (code !== 0) err(`failed to start ${name}`)
  console.log(`${name} started`)
}

async function cmdStop(args: string[]): Promise<void> {
  const name = resolveProject(args[0])
  if (!projectExists(name)) err(`project not found: ${name}`)
  const code = await compose(projectComposeFile(name), ["stop"])
  if (code !== 0) err(`failed to stop ${name}`)
  console.log(`${name} stopped`)
}

async function ensureRunning(name: string): Promise<string> {
  const cn = containerName(name)
  if (!containerRunning(cn)) await compose(projectComposeFile(name), ["up", "-d"])
  return cn
}

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

async function sshInto(name: string, remoteCmd: string): Promise<number> {
  await ensureRunning(name)
  const sshArgs = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-p", String(projectSshPort(name)),
    "-t",
    `root@localhost`,
    remoteCmd,
  ]
  const p = Bun.spawn(["ssh", ...sshArgs], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  return await p.exited
}

async function cmdShell(args: string[]): Promise<void> {
  const name = resolveProject(args[0])
  if (!projectExists(name)) err(`project not found: ${name}`)
  process.exit(await sshInto(name, "cd /work && exec zsh -l"))
}

async function cmdEnter(args: string[]): Promise<void> {
  const name = resolveProject(args[0])
  if (!projectExists(name)) err(`project not found: ${name}`)
  const cn = await ensureRunning(name)
  const code = await dockerStream(["exec", "-it", cn, "zsh", "-l"])
  process.exit(code)
}

async function cmdExec(args: string[]): Promise<void> {
  const { before, after } = splitDoubleDash(args)
  const { name } = takeProject(before)
  if (after.length === 0) err("usage: dev exec [<name>] -- <cmd...>")
  if (!projectExists(name)) err(`project not found: ${name}`)
  const cn = containerName(name)
  if (!containerRunning(cn)) await compose(projectComposeFile(name), ["up", "-d"])
  const code = await dockerStream(["exec", "-it", cn, ...after])
  process.exit(code)
}

async function cmdClaude(args: string[]): Promise<void> {
  const { name, rest } = takeProject(args)
  if (!projectExists(name)) err(`project not found: ${name}`)
  const claudeCmd = ["claude", ...rest.map(shellEscape)].join(" ")
  process.exit(await sshInto(name, `cd /work && exec ${claudeCmd}`))
}

async function cmdCode(args: string[], editor: "code" | "cursor"): Promise<void> {
  const name = resolveProject(args[0])
  if (!projectExists(name)) err(`project not found: ${name}`)
  const cn = containerName(name)
  if (!containerRunning(cn)) {
    console.log(`starting ${name}`)
    await compose(projectComposeFile(name), ["up", "-d"])
  }
  const code = await openInEditor(name, editor)
  process.exit(code)
}

async function cmdNuke(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args)
  const name = resolveProject(positional[0])
  if (!projectExists(name)) err(`project not found: ${name}`)

  if (!flags.yes) {
    console.error(`this will permanently delete: ${srcVolume(name)}, ${cacheVolume(name)}, and all source code in them.`)
    console.error(`re-run with --yes to confirm: dev nuke ${name} --yes`)
    process.exit(1)
  }

  console.log(`nuking ${name}`)
  await compose(projectComposeFile(name), ["down", "-v"])
  dockerSync(["volume", "rm", "-f", srcVolume(name)])
  dockerSync(["volume", "rm", "-f", cacheVolume(name)])
  deleteProjectConfig(name)
  console.log(`${name} nuked`)
}

async function cmdRebuild(args: string[]): Promise<void> {
  const name = resolveProject(args[0])
  if (!projectExists(name)) err(`project not found: ${name}`)
  console.log(`rebuilding ${name} (preserving volumes)`)
  await compose(projectComposeFile(name), ["down"])
  const meta = readMeta(name)
  writeCompose(meta)
  ensureVolume(srcVolume(name))
  ensureVolume(cacheVolume(name))
  const code = await compose(projectComposeFile(name), ["up", "-d", "--force-recreate"])
  if (code !== 0) err(`failed to rebuild`)
  console.log(`${name} rebuilt`)
}

async function cmdAuth(args: string[]): Promise<void> {
  const { flags } = parseFlags(args)
  await runAuth({ fromScratch: !!flags["from-scratch"] })
}

function buildImageSync(): number {
  const dotfiles = process.env.DOTFILES ?? `${process.env.HOME}/code/dotfiles`
  const proc = spawnSync(["bash", `${dotfiles}/tools/docker/base/build.sh`], {
    stdin: "inherit", stdout: "inherit", stderr: "inherit",
  })
  return proc.exitCode
}

function cmdBuildImage(): void {
  process.exit(buildImageSync())
}

async function cmdInit(): Promise<void> {
  const cfg = readGlobalConfig()
  if (dockerSync(["info"]).code !== 0) err("docker is not running. start orbstack/docker desktop first.")

  if (!imageExists(cfg.baseImage)) {
    if (buildImageSync() !== 0) err(`base image build failed`)
  } else {
    console.log(`base image ${cfg.baseImage} already built`)
  }

  if (!volumeExists(cfg.credsVolume)) {
    await runAuth()
  } else {
    console.log(`creds volume ${cfg.credsVolume} already exists. run 'dev auth' to refresh.`)
  }
}

function cmdDoctor(): void {
  const cfg = readGlobalConfig()
  let ok = true

  const dockerOk = dockerSync(["info"]).code === 0
  console.log(`docker:        ${dockerOk ? "ok" : "FAIL"}`)
  if (!dockerOk) ok = false

  const imgOk = imageExists(cfg.baseImage)
  console.log(`base image:    ${imgOk ? "ok" : `MISSING (${cfg.baseImage})`}`)
  if (!imgOk) ok = false

  const credsOk = volumeExists(cfg.credsVolume)
  console.log(`creds volume:  ${credsOk ? "ok" : `MISSING (${cfg.credsVolume})`}`)
  if (!credsOk) ok = false

  console.log(`projects:      ${listProjects().length}`)
  if (!ok) process.exit(1)
}

async function cmdBackup(args: string[]): Promise<void> {
  const { name, rest } = takeProject(args)
  const out = rest[0]
  if (!out) err("usage: dev backup [<name>] <out.tar.gz>")
  if (!projectExists(name)) err(`project not found: ${name}`)
  const src = srcVolume(name)
  const outPath = out.startsWith("/") ? out : `${process.cwd()}/${out}`
  const dirOf = outPath.replace(/\/[^/]+$/, "") || "/"
  const fileOf = outPath.replace(/^.*\//, "")
  console.log(`backing up volume ${src} → ${outPath}`)
  const code = await dockerStream([
    "run", "--rm",
    "-v", `${src}:/src:ro`,
    "-v", `${dirOf}:/backup`,
    "alpine:latest",
    "tar", "czf", `/backup/${fileOf}`, "-C", "/src", ".",
  ])
  if (code !== 0) err(`backup failed`)
  console.log(`backup written: ${outPath}`)
}

async function cmdRestore(args: string[]): Promise<void> {
  const { name, rest } = takeProject(args)
  const input = rest[0]
  if (!input) err("usage: dev restore [<name>] <in.tar.gz>")
  if (!projectExists(name)) err(`project not found: ${name}`)
  const src = srcVolume(name)
  const inPath = input.startsWith("/") ? input : `${process.cwd()}/${input}`
  const dirOf = inPath.replace(/\/[^/]+$/, "") || "/"
  const fileOf = inPath.replace(/^.*\//, "")

  ensureVolume(src)
  console.log(`restoring ${inPath} → volume ${src} (existing contents will be deleted)`)
  const code = await dockerStream([
    "run", "--rm",
    "-v", `${src}:/dst`,
    "-v", `${dirOf}:/backup:ro`,
    "alpine:latest",
    "sh", "-c",
    `cd /dst && find . -mindepth 1 -delete && tar xzf /backup/${fileOf}`,
  ])
  if (code !== 0) err(`restore failed`)
  console.log(`restored`)
}

function cmdConfig(args: string[]): void {
  const [sub, ...rest] = args
  const cfg = readGlobalConfig()
  if (!sub) {
    console.log(JSON.stringify(cfg, null, 2))
    return
  }
  if (sub === "get") {
    const [key] = rest
    if (!key) err("usage: dev config get <key>")
    const value = (cfg as unknown as Record<string, unknown>)[key]
    console.log(value === undefined ? "" : String(value))
    return
  }
  if (sub === "set") {
    const [key, value] = rest
    if (!key || value === undefined) err("usage: dev config set <key> <value>")
    if (key !== "baseImage" && key !== "credsVolume") err(`unknown config key: ${key}`)
    cfg[key] = value
    writeGlobalConfig(cfg)
    console.log(`set ${key} = ${value}`)
    return
  }
  err(`unknown config subcommand: ${sub}`)
}

export async function devMain(args: string[]): Promise<void> {
  const [cmd, ...rest] = args
  if (!cmd) {
    cmdList()
    return
  }

  switch (cmd) {
    case "create":      return cmdCreate(rest)
    case "list":        return cmdList()
    case "ls":          return cmdList()
    case "start":       return cmdStart(rest)
    case "stop":        return cmdStop(rest)
    case "shell":       return cmdShell(rest)
    case "ssh":         return cmdShell(rest)
    case "enter":       return cmdEnter(rest)
    case "exec":        return cmdExec(rest)
    case "claude":      return cmdClaude(rest)
    case "code":        return cmdCode(rest, "code")
    case "cursor":      return cmdCode(rest, "cursor")
    case "nuke":        return cmdNuke(rest)
    case "rebuild":     return cmdRebuild(rest)
    case "init":        return cmdInit()
    case "auth":        return cmdAuth(rest)
    case "build-image": return cmdBuildImage()
    case "doctor":      return cmdDoctor()
    case "backup":      return cmdBackup(rest)
    case "restore":     return cmdRestore(rest)
    case "config":      return cmdConfig(rest)
    case "help":        usage()
    case "-h":          usage()
    case "--help":      usage()
    default:            usage()
  }
}
