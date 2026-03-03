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

function findTopLevelDirs(repoPath: string): string[] {
  return readdirSync(repoPath).filter((name) => {
    if (name.startsWith(".")) return false;
    try {
      return statSync(join(repoPath, name)).isDirectory();
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

  const workspace = await p.text({
    message: "workspace name",
    validate: (v) => (v.length === 0 ? "required" : undefined),
  });

  if (p.isCancel(workspace)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const branch = await p.text({
    message: "branch name",
    defaultValue: workspace,
    initialValue: workspace,
  });

  if (p.isCancel(branch)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const sparseSelections: Record<string, string[]> = {};

  for (const repo of selected) {
    const repoPath = join(LETTUCE_DIR, repo);
    const dirs = findTopLevelDirs(repoPath);

    if (dirs.length === 0) continue;

    const folders = await p.multiselect({
      message: `${repo}: folders to include (select none for everything)`,
      options: [
        { value: "*", label: "everything (no sparse checkout)" },
        ...dirs.map((d) => ({ value: d, label: d })),
      ],
    });

    if (p.isCancel(folders)) {
      p.cancel("cancelled");
      process.exit(0);
    }

    if (!folders.includes("*")) {
      sparseSelections[repo] = folders;
    }
  }

  const wsDir = join(WORKSPACES_DIR, workspace);
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

      if (sparseSelections[repo]) {
        const folders = sparseSelections[repo];
        execSync(`git sparse-checkout init --cone`, { cwd: dest, stdio: "pipe" });
        execSync(`git sparse-checkout set ${folders.map((f) => `"${f}"`).join(" ")}`, {
          cwd: dest,
          stdio: "pipe",
        });
        spinner.stop(`${repo} - done (sparse: ${folders.join(", ")})`);
        results.push({ repo, ok: true, msg: `sparse: ${folders.join(", ")}` });
      } else {
        spinner.stop(`${repo} - done`);
        results.push({ repo, ok: true, msg: "created" });
      }
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

  p.outro(`cd ${wsDir}`);
}

main();
