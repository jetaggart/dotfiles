import { readGlobalConfig } from "./config"
import { ensureVolume, dockerStream, imageExists } from "./docker"

export async function runAuth(opts: { domain?: string; credsVolume?: string }): Promise<void> {
  const cfg = readGlobalConfig()
  const image = cfg.baseImage
  const creds = opts.credsVolume
    ?? (opts.domain ? cfg.domains[opts.domain]?.credsVolume : undefined)
    ?? cfg.credsVolume

  if (!imageExists(image)) {
    throw new Error(`base image '${image}' not built. run: dev init`)
  }

  ensureVolume(creds)

  console.log(`auth into volume: ${creds}`)
  console.log(`tasks inside the container:`)
  console.log(`  1. claude /login                                   (claude oauth)`)
  console.log(`  2. ssh-keygen -t ed25519 -f ~/.dev-creds/ssh/id_ed25519 -N ''  (github key)`)
  console.log(`  3. cat ~/.dev-creds/ssh/id_ed25519.pub             (add to github)`)
  console.log(`  4. echo "[user]\\n  name = Your Name\\n  email = you@example.com" > ~/.dev-creds/gitconfig`)
  console.log(`  5. exit when done`)
  console.log(``)

  const code = await dockerStream([
    "run", "--rm", "-it",
    "--name", "dev-auth",
    "--network", "host",
    "--entrypoint", "",
    "-v", `${creds}:/home/dev/.dev-creds`,
    "-w", "/home/dev",
    "-e", `DEV_CREDS_DIR=/home/dev/.dev-creds`,
    image,
    "bash", "-lc",
    `mkdir -p ~/.dev-creds/claude ~/.dev-creds/ssh && \
     ln -sf ~/.dev-creds/claude /home/dev/.claude-creds && \
     mkdir -p ~/.claude && \
     ln -sf ~/.dev-creds/claude/.credentials.json ~/.claude/.credentials.json 2>/dev/null; \
     export HOME=/home/dev; \
     exec zsh -l`
  ])

  if (code !== 0) {
    throw new Error(`auth container exited with code ${code}`)
  }
  console.log(`auth complete`)
}
