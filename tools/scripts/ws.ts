#!/usr/bin/env bun
import * as p from "@clack/prompts";
import { readdirSync, statSync, lstatSync, existsSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, symlinkSync, readlinkSync } from "fs";
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

  if (command === "add") {
    const config = readWsConfig();
    if (!config) {
      console.error("not in a workspace directory (no .ws.json found)");
      process.exit(1);
    }
    return { command, ...config };
  }

  if (command === "delete") {
    if (rest.length === 1) {
      const wsDir = resolve(rest[0]);
      const configPath = join(wsDir, WS_CONFIG);
      if (!existsSync(configPath)) {
        console.error(`not a workspace directory (no .ws.json in ${wsDir})`);
        process.exit(1);
      }
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return { command, source: config.source, target: wsDir };
    }
    console.error("usage: ws delete <workspace_dir>");
    process.exit(1);
  }

  console.error("usage: ws <command>");
  console.error("  ws create <preset>                 create workspace from preset");
  console.error("  ws create <source_dir> <target_dir> create workspace");
  console.error("  ws add                             add repo (run from workspace dir)");
  console.error("  ws delete <workspace_dir>          delete a workspace");
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
    const src = join(repoPath, f);
    const dst = join(dest, f);
    const stat = lstatSync(src);
    mkdirSync(join(dest, dirname(f)), { recursive: true });
    if (stat.isSymbolicLink()) {
      symlinkSync(readlinkSync(src), dst);
    } else if (stat.isDirectory()) {
      execSync(`cp -a "${src}" "${dst}"`, { stdio: "pipe" });
    } else if (stat.isFile()) {
      copyFileSync(src, dst);
    }
  }
}

function readFocusDirs(wsDir: string): Record<string, string[]> {
  const filePath = join(wsDir, "CLAUDE.local.md");
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const result: Record<string, string[]> = {};
  for (const match of content.matchAll(/^- (.+?)\/(.+?)\/$/gm)) {
    const repo = match[1];
    const dir = match[2];
    if (!result[repo]) result[repo] = [];
    result[repo].push(dir);
  }
  for (const match of content.matchAll(/^- ([^/]+?)\/$/gm)) {
    const repo = match[1];
    if (!result[repo]) result[repo] = ["*"];
  }
  return result;
}

function writeClaudeLocal(wsDir: string, focusDirs: Record<string, string[]>) {
  const filePath = join(wsDir, "CLAUDE.local.md");
  const lines: string[] = [];
  for (const repo of Object.keys(focusDirs).sort()) {
    if (focusDirs[repo].includes("*")) {
      lines.push(`- ${repo}/`);
    } else {
      for (const dir of focusDirs[repo]) {
        lines.push(`- ${repo}/${dir}/`);
      }
    }
  }
  if (lines.length === 0) {
    if (existsSync(filePath)) execSync(`rm -f "${filePath}"`, { stdio: "pipe" });
    return;
  }
  const content = `<focus>\nOnly work in these directories:\n${lines.join("\n")}\n</focus>\n`;
  writeFileSync(filePath, content);
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
  selected.sort();

  const workspace = await p.text({
    message: "workspace name",
    validate: (v) => (v.length === 0 ? "required" : undefined),
  });
  if (p.isCancel(workspace)) { p.cancel("cancelled"); process.exit(0); }

  const focusDirs: Record<string, string[]> = {};

  for (const repo of selected) {
    const repoPath = join(source, repo);
    const dirs = findTopLevelDirs(repoPath);
    if (dirs.length === 0) continue;

    const folders = await p.multiselect({
      message: `${repo}: focus directories`,
      options: [
        { value: "*", label: "everything" },
        ...dirs.map((d) => ({ value: d, label: d })),
      ],
    });
    if (p.isCancel(folders)) { p.cancel("cancelled"); process.exit(0); }

    focusDirs[repo] = folders.includes("*") ? ["*"] : folders;
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

      const focus = focusDirs[repo];
      const focusLabel = focus.includes("*") ? "everything" : focus.join(", ");
      spinner.stop(`${repo} - done (focus: ${focusLabel})`);
      results.push({ repo, ok: true, msg: `focus: ${focusLabel}` });
    } catch (e: any) {
      const msg = e.stderr?.toString().trim() || e.message || "unknown error";
      spinner.stop(`${repo} - failed`);
      results.push({ repo, ok: false, msg });
    }
  }

  writeClaudeLocal(wsDir, focusDirs);

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

  if (!tracked) {
    let focusSelection: string[] | null = null;

    if (dirs.length > 0) {
      const folders = await p.multiselect({
        message: `${repo}: focus directories`,
        options: [
          { value: "*", label: "everything" },
          ...dirs.map((d) => ({ value: d, label: d })),
        ],
      });
      if (p.isCancel(folders)) { p.cancel("cancelled"); process.exit(0); }
      focusSelection = folders.includes("*") ? ["*"] : folders;
    }

    const spinner = p.spinner();
    spinner.start(repo);

    try {
      createWorktree(repoPath, dest, wsName);
      spinner.stop(`${repo} - done`);
    } catch (e: any) {
      const stderr = e.stderr?.toString().trim() || e.message || "unknown error";
      spinner.stop(`${repo} - failed: ${stderr}`);
      p.outro("done");
      return;
    }

    const existing = readFocusDirs(wsDir);
    existing[repo] = focusSelection || ["*"];
    writeClaudeLocal(wsDir, existing);
    const focusLabel = existing[repo].includes("*") ? "everything" : existing[repo].join(", ");
    p.outro(`${repo} - focus: ${focusLabel}`);
  } else {
    if (dirs.length === 0) {
      p.cancel(`${repo} is already in workspace and has no subdirectories`);
      process.exit(0);
    }

    const folders = await p.multiselect({
      message: `${repo}: focus directories`,
      options: [
        { value: "*", label: "everything" },
        ...dirs.map((d) => ({ value: d, label: d })),
      ],
    });
    if (p.isCancel(folders)) { p.cancel("cancelled"); process.exit(0); }

    const existing = readFocusDirs(wsDir);
    existing[repo] = folders.includes("*") ? ["*"] : folders;
    writeClaudeLocal(wsDir, existing);
    const focusLabel = existing[repo].includes("*") ? "everything" : existing[repo].join(", ");
    p.outro(`${repo} - focus: ${focusLabel}`);
  }
}

async function deleteWorkspace(source: string, wsDir: string) {

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

  const confirm = await p.confirm({ message: `delete workspace ${basename(wsDir)}? (${repos.join(", ")})` });
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
      const stderr = e.stderr?.toString().trim() || e.message || "unknown error";
      spinner.stop(`${repo} - failed`);
      results.push({ repo, ok: false, msg: stderr });
    }
  }

  try { execSync(`rm -rf "${wsDir}"`, { stdio: "pipe" }); } catch {}

  p.note(
    results.map((r) => `${r.ok ? "-" : "x"} ${r.repo}: ${r.msg}`).join("\n"),
    "delete complete"
  );
  p.outro("done");
}

async function main() {
  const { command, source, target } = parseArgs();

  p.intro("ws");

  if (command === "create") await create(source, target);
  else if (command === "add") await add(source, target);
  else if (command === "delete") await deleteWorkspace(source, target);
}

main();
