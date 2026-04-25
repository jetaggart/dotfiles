import { readGlobalConfig } from "./config"
import { ensureVolume, dockerStream, imageExists } from "./docker"

export async function runAuth(opts: { fromScratch?: boolean } = {}): Promise<void> {
  const cfg = readGlobalConfig()

  if (!imageExists(cfg.baseImage)) {
    throw new Error(`base image '${cfg.baseImage}' not built. run: dev init`)
  }

  ensureVolume(cfg.credsVolume)

  console.log(`auth into volume: ${cfg.credsVolume}`)
  console.log(``)

  const args = [
    "run", "--rm", "-it",
    "--name", "dev-auth",
    "--network", "host",
    "--entrypoint", "",
    "-v", `${cfg.credsVolume}:/root/.dev-creds`,
    "-w", "/root",
    "-e", `DEV_CREDS_DIR=/root/.dev-creds`,
  ]
  if (opts.fromScratch) {
    args.push("-e", "FROM_SCRATCH=1")
  }
  args.push(cfg.baseImage, "bash", "/root/code/dotfiles/tools/docker/base/dev-auth-init.sh")

  const code = await dockerStream(args)

  if (code !== 0) {
    throw new Error(`auth container exited with code ${code}`)
  }
  console.log(`auth complete`)
}
