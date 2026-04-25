import { dockerStream } from "./docker"
import { srcVolume } from "./paths"

const DEVCONTAINER_JSON = (project: string) => JSON.stringify({
  name: project,
  image: "dev-base:latest",
  workspaceFolder: "/work",
  remoteUser: "dev",
  customizations: {
    vscode: {
      extensions: [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
      ],
      settings: {
        "terminal.integrated.defaultProfile.linux": "zsh",
      },
    },
  },
}, null, 2)

export async function writeDevcontainerJson(project: string, image: string): Promise<void> {
  const src = srcVolume(project)
  const content = DEVCONTAINER_JSON(project).replace("dev-base:latest", image)
  const escaped = content.replace(/'/g, "'\\''")

  const code = await dockerStream([
    "run", "--rm",
    "-v", `${src}:/dst`,
    "alpine:latest",
    "sh", "-c",
    `mkdir -p /dst/.devcontainer && printf '%s\\n' '${escaped}' > /dst/.devcontainer/devcontainer.json`
  ])

  if (code !== 0) {
    throw new Error(`failed to write devcontainer.json (exit ${code})`)
  }
}
