#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { readdirSync, statSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const LETTUCE_DIR = join(process.env.HOME!, "code", "lettuce");
const WORKSPACES_DIR = join(LETTUCE_DIR, "workspaces");

function findRepos(): string[] {
  return readdirSync(LETTUCE_DIR).filter((name) => {
    if (name === "workspaces" || name === "workspace") return false;
    try {
      return statSync(join(LETTUCE_DIR, name, ".git")).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}

function findWorkspaces(): string[] {
  if (!existsSync(WORKSPACES_DIR)) return [];
  return readdirSync(WORKSPACES_DIR).filter((name) => {
    try {
      return statSync(join(WORKSPACES_DIR, name)).isDirectory();
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

function repoExistsInWorkspace(wsDir: string, repo: string): boolean {
  return existsSync(join(wsDir, repo));
}

function hasSparseCheckout(worktreePath: string): boolean {
  try {
    const result = execSync(`git sparse-checkout list`, { cwd: worktreePath, stdio: "pipe" });
    return result.toString().trim().length > 0;
  } catch {
    return false;
  }
}

async function main() {
  p.intro("lettuce workspace add");

  const workspaces = findWorkspaces();
  if (workspaces.length === 0) {
    p.cancel("no workspaces found - create one with lettuce-workspace first");
    process.exit(1);
  }

  const workspace = await p.select({
    message: "select workspace",
    options: workspaces.map((w) => ({ value: w, label: w })),
  });

  if (p.isCancel(workspace)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const wsDir = join(WORKSPACES_DIR, workspace);
  const repos = findRepos();

  const repo = await p.select({
    message: "select repo",
    options: repos.map((r) => {
      const tracked = repoExistsInWorkspace(wsDir, r);
      return { value: r, label: r, hint: tracked ? "already in workspace" : undefined };
    }),
  });

  if (p.isCancel(repo)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const repoPath = join(LETTUCE_DIR, repo);
  const dest = join(wsDir, repo);
  const tracked = repoExistsInWorkspace(wsDir, repo);

  const dirs = findTopLevelDirs(repoPath);

  if (tracked) {
    if (dirs.length === 0) {
      p.cancel(`${repo} is already in workspace and has no subdirectories`);
      process.exit(0);
    }

    const sparse = hasSparseCheckout(dest);

    const folders = await p.multiselect({
      message: `${repo}: folders to add`,
      options: dirs.map((d) => ({ value: d, label: d })),
    });

    if (p.isCancel(folders)) {
      p.cancel("cancelled");
      process.exit(0);
    }

    const spinner = p.spinner();
    spinner.start(`adding folders to ${repo}`);

    try {
      if (!sparse) {
        execSync(`git sparse-checkout init --cone`, { cwd: dest, stdio: "pipe" });
      }
      execSync(`git sparse-checkout add ${folders.map((f) => `"${f}"`).join(" ")}`, {
        cwd: dest,
        stdio: "pipe",
      });
      spinner.stop(`${repo} - added ${folders.join(", ")}`);
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || "unknown error";
      spinner.stop(`${repo} - failed: ${stderr}`);
    }
  } else {
    const branch = await p.text({
      message: "branch name",
      defaultValue: workspace,
      initialValue: workspace,
    });

    if (p.isCancel(branch)) {
      p.cancel("cancelled");
      process.exit(0);
    }

    let sparseSelection: string[] | null = null;

    if (dirs.length > 0) {
      const folders = await p.multiselect({
        message: `${repo}: folders to include`,
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
        sparseSelection = folders;
      }
    }

    const spinner = p.spinner();
    spinner.start(repo);

    try {
      execSync(`zsh -ic 'cd "${repoPath}" && wtn "${dest}" "${branch}"'`, {
        stdio: "pipe",
      });

      if (sparseSelection) {
        execSync(`git sparse-checkout init --cone`, { cwd: dest, stdio: "pipe" });
        execSync(`git sparse-checkout set ${sparseSelection.map((f) => `"${f}"`).join(" ")}`, {
          cwd: dest,
          stdio: "pipe",
        });
        spinner.stop(`${repo} - done (sparse: ${sparseSelection.join(", ")})`);
      } else {
        spinner.stop(`${repo} - done`);
      }
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || "unknown error";
      spinner.stop(`${repo} - failed: ${stderr}`);
    }
  }

  p.outro(`cd ${wsDir}`);
}

main();
