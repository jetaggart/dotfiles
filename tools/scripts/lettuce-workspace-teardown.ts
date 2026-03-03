#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { readdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const LETTUCE_DIR = join(process.env.HOME!, "code", "lettuce");
const WORKSPACES_DIR = join(LETTUCE_DIR, "workspaces");

function findWorkspaces(): string[] {
  if (!existsSync(WORKSPACES_DIR)) return [];
  return readdirSync(WORKSPACES_DIR).filter((name) => {
    const full = join(WORKSPACES_DIR, name);
    try {
      return Bun.file(full).type === "application/octet-stream" || existsSync(full);
    } catch {
      return false;
    }
  }).sort();
}

function findReposInWorkspace(workspace: string): string[] {
  const wsDir = join(WORKSPACES_DIR, workspace);
  if (!existsSync(wsDir)) return [];
  return readdirSync(wsDir).sort();
}

function findParentRepo(repoName: string): string | null {
  const repoPath = join(LETTUCE_DIR, repoName);
  if (existsSync(join(repoPath, ".git"))) return repoPath;
  return null;
}

async function main() {
  p.intro("lettuce workspace teardown");

  const workspaces = findWorkspaces();
  if (workspaces.length === 0) {
    p.cancel("no workspaces found");
    process.exit(1);
  }

  const selected = await p.multiselect({
    message: "select workspaces to tear down",
    options: workspaces.map((w) => {
      const repos = findReposInWorkspace(w);
      return { value: w, label: w, hint: repos.join(", ") };
    }),
  });

  if (p.isCancel(selected)) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const confirm = await p.confirm({
    message: `delete ${selected.length} workspace(s)?`,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.cancel("cancelled");
    process.exit(0);
  }

  const results: { workspace: string; repo: string; ok: boolean; msg: string }[] = [];

  for (const workspace of selected) {
    const repos = findReposInWorkspace(workspace);
    const wsDir = join(WORKSPACES_DIR, workspace);

    for (const repo of repos) {
      const worktreePath = join(wsDir, repo);
      const parentRepo = findParentRepo(repo);
      const spinner = p.spinner();
      spinner.start(`${workspace}/${repo}`);

      try {
        if (parentRepo) {
          execSync(`git -C "${parentRepo}" worktree remove "${worktreePath}" --force`, {
            stdio: "pipe",
          });
        } else {
          execSync(`rm -rf "${worktreePath}"`, { stdio: "pipe" });
        }
        spinner.stop(`${workspace}/${repo} - removed`);
        results.push({ workspace, repo, ok: true, msg: "removed" });
      } catch (e: any) {
        const stderr = e.stderr?.toString().trim() || "unknown error";
        spinner.stop(`${workspace}/${repo} - failed`);
        results.push({ workspace, repo, ok: false, msg: stderr });
      }
    }

    try {
      execSync(`rm -rf "${wsDir}"`, { stdio: "pipe" });
    } catch {}
  }

  p.note(
    results.map((r) => `${r.ok ? "-" : "x"} ${r.workspace}/${r.repo}: ${r.msg}`).join("\n"),
    "teardown complete"
  );

  p.outro("done");
}

main();
