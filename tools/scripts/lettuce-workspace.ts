#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const LETTUCE_DIR = join(process.env.HOME!, "code", "lettuce");
const WORKSPACES_DIR = join(LETTUCE_DIR, "workspaces");

function findRepos(): string[] {
  const entries = readdirSync(LETTUCE_DIR);
  return entries.filter((name) => {
    if (name === "workspaces" || name === "workspace") return false;
    const full = join(LETTUCE_DIR, name);
    try {
      return statSync(join(full, ".git")).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}

async function main() {
  p.intro("lettuce workspace");

  const repos = findRepos();
  if (repos.length === 0) {
    p.cancel("no git repos found in ~/code/lettuce/");
    process.exit(1);
  }

  const selected = await p.multiselect({
    message: "select repos",
    options: repos.map((r) => ({ value: r, label: r })),
  });

  if (p.isCancel(selected)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const branch = await p.text({
    message: "branch name",
    validate: (v) => (v.length === 0 ? "required" : undefined),
  });

  if (p.isCancel(branch)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const wsDir = join(WORKSPACES_DIR, branch);
  execSync(`mkdir -p "${wsDir}"`);

  const results: { repo: string; ok: boolean; msg: string }[] = [];

  for (const repo of selected) {
    const repoPath = join(LETTUCE_DIR, repo);
    const dest = join(wsDir, repo);
    const spinner = p.spinner();
    spinner.start(repo);

    try {
      execSync(`zsh -ic 'cd "${repoPath}" && wtn "${dest}" "${branch}"'`, {
        stdio: "pipe",
      });
      spinner.stop(`${repo} - done`);
      results.push({ repo, ok: true, msg: "created" });
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || "unknown error";
      spinner.stop(`${repo} - failed`);
      results.push({ repo, ok: false, msg: stderr });
    }
  }

  p.note(
    results.map((r) => `${r.ok ? "+" : "x"} ${r.repo}: ${r.msg}`).join("\n"),
    `workspace: ${wsDir}`
  );

  p.outro("done");
}

main();
