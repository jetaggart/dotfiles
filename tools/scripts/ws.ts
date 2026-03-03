#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { readdirSync, statSync, existsSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import { join, resolve, basename, dirname } from "path";

const PRESETS: Record<string, { source: string; target: string }> = {
  lettuce: {
    source: join(process.env.HOME!, "code", "lettuce"),
    target: join(process.env.HOME!, "code", "lettuce", "workspaces"),
  },
};

const WS_CONFIG = ".ws.json";

function parseArgs(): { command: string; source: string; target: string } {
  const args = process.argv.slice(2);
  const command = args[0] || "";
  const rest = args.slice(1);

  if (command === "create") {
    if (rest.length === 1 && PRESETS[rest[0]]) {
      return { command, ...PRESETS[rest[0]] };
    }
    if (rest.length === 2) {
      return { command, source: resolve(rest[0]), target: resolve(rest[1]) };
    }
    console.error("usage: ws create <preset> | ws create <source_dir> <target_dir>");
    console.error(`presets: ${Object.keys(PRESETS).join(", ")}`);
    process.exit(1);
  }

  if (command === "add" || command === "teardown") {
    const config = readWsConfig();
    if (!config) {
      console.error("not in a workspace directory (no .ws.json found)");
      process.exit(1);
    }
    return { command, ...config };
  }

  console.error("usage: ws <command>");
  console.error("  ws create <preset>                 create workspace from preset");
  console.error("  ws create <source_dir> <target_dir> create workspace");
  console.error("  ws add                             add repo (run from workspace dir)");
  console.error("  ws teardown                        teardown (run from workspace dir)");
  console.error(`presets: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}

function readWsConfig(): { source: string; target: string } | null {
  let dir = process.cwd();
  while (true) {
    const configPath = join(dir, WS_CONFIG);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return { source: config.source, target: join(dir, "..") };
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function writeWsConfig(wsDir: string, source: string) {
  writeFileSync(join(wsDir, WS_CONFIG), JSON.stringify({ source }, null, 2) + "\n");
}

function findRepos(sourceDir: string): string[] {
  return readdirSync(sourceDir).filter((name) => {
    if (name === "workspaces" || name === "workspace") return false;
    try {
      return statSync(join(sourceDir, name, ".git")).isDirectory();
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

function createWorktree(repoPath: string, dest: string, branch: string) {
  try {
    execSync(`git worktree add "${dest}" -b "${branch}"`, { cwd: repoPath, stdio: "pipe" });
  } catch {
    execSync(`git worktree add "${dest}" "${branch}"`, { cwd: repoPath, stdio: "pipe" });
  }

  const ignored = execSync("git ls-files --others --ignored --exclude-standard", { cwd: repoPath, stdio: "pipe" })
    .toString().trim().split("\n").filter(Boolean);

  for (const f of ignored) {
    mkdirSync(join(dest, dirname(f)), { recursive: true });
    copyFileSync(join(repoPath, f), join(dest, f));
  }
}

function hasSparseCheckout(worktreePath: string): boolean {
  try {
    const result = execSync("git sparse-checkout list", { cwd: worktreePath, stdio: "pipe" });
    return result.toString().trim().length > 0;
  } catch {
    return false;
  }
}

function currentWorkspaceDir(): string | null {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, WS_CONFIG))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function create(source: string, target: string) {
  const repos = findRepos(source);
  if (repos.length === 0) {
    p.cancel(`no git repos found in ${source}`);
    process.exit(1);
  }

  const selected = await p.multiselect({
    message: "select repos",
    options: repos.map((r) => ({ value: r, label: r })),
  });
  if (p.isCancel(selected)) { p.cancel("cancelled"); process.exit(0); }

  const workspace = await p.text({
    message: "workspace name",
    validate: (v) => (v.length === 0 ? "required" : undefined),
  });
  if (p.isCancel(workspace)) { p.cancel("cancelled"); process.exit(0); }

  const sparseSelections: Record<string, string[]> = {};

  for (const repo of selected) {
    const repoPath = join(source, repo);
    const dirs = findTopLevelDirs(repoPath);
    if (dirs.length === 0) continue;

    const folders = await p.multiselect({
      message: `${repo}: folders to include`,
      options: [
        { value: "*", label: "everything (no sparse checkout)" },
        ...dirs.map((d) => ({ value: d, label: d })),
      ],
    });
    if (p.isCancel(folders)) { p.cancel("cancelled"); process.exit(0); }

    if (!folders.includes("*")) {
      sparseSelections[repo] = folders;
    }
  }

  const wsDir = join(target, workspace);
  execSync(`mkdir -p "${wsDir}"`);
  writeWsConfig(wsDir, source);

  const results: { repo: string; ok: boolean; msg: string }[] = [];

  for (const repo of selected) {
    const repoPath = join(source, repo);
    const dest = join(wsDir, repo);
    const spinner = p.spinner();
    spinner.start(repo);

    try {
      createWorktree(repoPath, dest, workspace);

      if (sparseSelections[repo]) {
        const folders = sparseSelections[repo];
        execSync("git sparse-checkout init --cone", { cwd: dest, stdio: "pipe" });
        execSync(`git sparse-checkout set ${folders.map((f) => `"${f}"`).join(" ")}`, { cwd: dest, stdio: "pipe" });
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

async function add(source: string, _target: string) {
  const wsDir = currentWorkspaceDir();
  if (!wsDir) {
    p.cancel("not in a workspace directory");
    process.exit(1);
  }

  const repos = findRepos(source);
  const wsName = basename(wsDir);

  const repo = await p.select({
    message: "select repo",
    options: repos.map((r) => {
      const tracked = existsSync(join(wsDir, r));
      return { value: r, label: r, hint: tracked ? "already in workspace" : undefined };
    }),
  });
  if (p.isCancel(repo)) { p.cancel("cancelled"); process.exit(0); }

  const repoPath = join(source, repo);
  const dest = join(wsDir, repo);
  const tracked = existsSync(dest);
  const dirs = findTopLevelDirs(repoPath);

  if (tracked) {
    if (dirs.length === 0) {
      p.cancel(`${repo} is already in workspace and has no subdirectories`);
      process.exit(0);
    }

    const folders = await p.multiselect({
      message: `${repo}: folders to add`,
      options: dirs.map((d) => ({ value: d, label: d })),
    });
    if (p.isCancel(folders)) { p.cancel("cancelled"); process.exit(0); }

    const spinner = p.spinner();
    spinner.start(`adding folders to ${repo}`);

    try {
      if (!hasSparseCheckout(dest)) {
        execSync("git sparse-checkout init --cone", { cwd: dest, stdio: "pipe" });
      }
      execSync(`git sparse-checkout add ${folders.map((f) => `"${f}"`).join(" ")}`, { cwd: dest, stdio: "pipe" });
      spinner.stop(`${repo} - added ${folders.join(", ")}`);
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || "unknown error";
      spinner.stop(`${repo} - failed: ${stderr}`);
    }
  } else {
    let sparseSelection: string[] | null = null;

    if (dirs.length > 0) {
      const folders = await p.multiselect({
        message: `${repo}: folders to include`,
        options: [
          { value: "*", label: "everything (no sparse checkout)" },
          ...dirs.map((d) => ({ value: d, label: d })),
        ],
      });
      if (p.isCancel(folders)) { p.cancel("cancelled"); process.exit(0); }
      if (!folders.includes("*")) sparseSelection = folders;
    }

    const spinner = p.spinner();
    spinner.start(repo);

    try {
      createWorktree(repoPath, dest, wsName);

      if (sparseSelection) {
        execSync("git sparse-checkout init --cone", { cwd: dest, stdio: "pipe" });
        execSync(`git sparse-checkout set ${sparseSelection.map((f) => `"${f}"`).join(" ")}`, { cwd: dest, stdio: "pipe" });
        spinner.stop(`${repo} - done (sparse: ${sparseSelection.join(", ")})`);
      } else {
        spinner.stop(`${repo} - done`);
      }
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || "unknown error";
      spinner.stop(`${repo} - failed: ${stderr}`);
    }
  }

  p.outro("done");
}

async function teardown(source: string, _target: string) {
  const wsDir = currentWorkspaceDir();
  if (!wsDir) {
    p.cancel("not in a workspace directory");
    process.exit(1);
  }

  const repos = readdirSync(wsDir).filter((name) => {
    if (name === WS_CONFIG) return false;
    try {
      return statSync(join(wsDir, name)).isDirectory();
    } catch {
      return false;
    }
  }).sort();

  if (repos.length === 0) {
    p.cancel("no repos in workspace");
    process.exit(1);
  }

  const confirm = await p.confirm({ message: `tear down workspace ${basename(wsDir)}? (${repos.join(", ")})` });
  if (p.isCancel(confirm) || !confirm) { p.cancel("cancelled"); process.exit(0); }

  const results: { repo: string; ok: boolean; msg: string }[] = [];

  for (const repo of repos) {
    const worktreePath = join(wsDir, repo);
    const parentRepo = join(source, repo);
    const spinner = p.spinner();
    spinner.start(repo);

    try {
      if (existsSync(join(parentRepo, ".git"))) {
        execSync(`git -C "${parentRepo}" worktree remove "${worktreePath}" --force`, { stdio: "pipe" });
      } else {
        execSync(`rm -rf "${worktreePath}"`, { stdio: "pipe" });
      }
      spinner.stop(`${repo} - removed`);
      results.push({ repo, ok: true, msg: "removed" });
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || "unknown error";
      spinner.stop(`${repo} - failed`);
      results.push({ repo, ok: false, msg: stderr });
    }
  }

  try { execSync(`rm -rf "${wsDir}"`, { stdio: "pipe" }); } catch {}

  p.note(
    results.map((r) => `${r.ok ? "-" : "x"} ${r.repo}: ${r.msg}`).join("\n"),
    "teardown complete"
  );
  p.outro("done");
}

async function main() {
  const { command, source, target } = parseArgs();

  p.intro("ws");

  if (command === "create") await create(source, target);
  else if (command === "add") await add(source, target);
  else if (command === "teardown") await teardown(source, target);
}

main();
