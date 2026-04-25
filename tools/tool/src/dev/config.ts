import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { CONFIG_DIR, GLOBAL_CONFIG, DEFAULT_BASE_IMAGE, DEFAULT_CREDS_VOLUME } from "./paths"

export type GlobalConfig = {
  baseImage: string
  credsVolume: string
}

const DEFAULT: GlobalConfig = {
  baseImage: DEFAULT_BASE_IMAGE,
  credsVolume: DEFAULT_CREDS_VOLUME,
}

export function readGlobalConfig(): GlobalConfig {
  if (!existsSync(GLOBAL_CONFIG)) return DEFAULT
  try {
    return { ...DEFAULT, ...JSON.parse(readFileSync(GLOBAL_CONFIG, "utf-8")) }
  } catch {
    return DEFAULT
  }
}

export function writeGlobalConfig(cfg: GlobalConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(GLOBAL_CONFIG, JSON.stringify(cfg, null, 2) + "\n")
}
