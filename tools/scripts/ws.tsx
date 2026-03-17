#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { copyFile } from "fs/promises";
import { Box, Text, render, useApp } from "ink";
import { basename, join, relative, resolve } from "path";
import { useEffect, useState } from "react";
import { Confirm, MultiSelect, Select, Spinner, TextInput, git, gitAsync, errorMsg } from "../core/index.ts";

const PRESETS: Record<string, { source: string; target: string }> = {
  lettuce: {
    source: join(process.env.HOME!, "code", "lettuce"),
    target: join(process.env.HOME!, "code", "lettuce", "workspaces"),
  },
};

const WS_CONFIG = ".ws.json";

type FocusMap = Record<string, string[]>;

function focusLabel(dirs: string[]): string {
  return dirs.includes("*") ? "everything" : dirs.join(", ");
}

function findRepos(sourceDir: string): string[] {
  return readdirSync(sourceDir)
    .filter((name) => {
      if (name === "workspaces" || name === "workspace" || name === ".me") return false;
      try {
        return statSync(join(sourceDir, name, ".git")).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function findTopLevelDirs(repoPath: string): string[] {
  return readdirSync(repoPath)
    .filter((name) => {
      if (name.startsWith(".")) return false;
      try {
        return statSync(join(repoPath, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function findWsDir(): { source: string; wsDir: string } | null {
  let dir = process.cwd();
  while (true) {
    const configPath = join(dir, WS_CONFIG);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return { source: config.source, wsDir: dir };
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

function readFocusDirs(wsDir: string): FocusMap {
  const filePath = join(wsDir, "CLAUDE.local.md");
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const result: FocusMap = {};
  for (const match of content.matchAll(/^- (.+?)\/(.+?)\/$/gm)) {
    if (!result[match[1]]) result[match[1]] = [];
    result[match[1]].push(match[2]);
  }
  for (const match of content.matchAll(/^- ([^/]+?)\/$/gm)) {
    if (!result[match[1]]) result[match[1]] = ["*"];
  }
  return result;
}

function writeFocusConfig(wsDir: string, focusDirs: FocusMap) {
  const entries: { repo: string; dir: string | null }[] = [];
  for (const repo of Object.keys(focusDirs).sort()) {
    if (focusDirs[repo].includes("*")) {
      entries.push({ repo, dir: null });
    } else {
      for (const dir of focusDirs[repo]) {
        entries.push({ repo, dir });
      }
    }
  }

  const localPath = join(wsDir, "CLAUDE.local.md");
  if (entries.length === 0) {
    if (existsSync(localPath)) rmSync(localPath);
    return;
  }

  const lines = entries.map((e) => (e.dir ? `- ${e.repo}/${e.dir}/` : `- ${e.repo}/`));
  const allRepos = Object.keys(focusDirs).sort();
  writeFileSync(localPath, `<focus>\nOnly modify files in these directories:\n${lines.join("\n")}\n\nYou may read from any directory in the workspace for context: ${allRepos.join(", ")}\n</focus>\n`);

  const folders = entries.map((e) =>
    e.dir ? { path: join(e.repo, e.dir), name: `${e.repo}/${e.dir}` } : { path: e.repo, name: e.repo }
  );
  writeFileSync(
    join(wsDir, `${basename(wsDir)}.code-workspace`),
    JSON.stringify(
      {
        folders,
        settings: { "files.exclude": { "**/.git": true, ".ws.json": true } },
      },
      null,
      2
    ) + "\n"
  );
}

function getDefaultBranch(repoPath: string): string {
  try {
    return git("symbolic-ref refs/remotes/origin/HEAD", repoPath).replace("refs/remotes/origin/", "");
  } catch {
    return "main";
  }
}

async function prepareRepoAsync(repoPath: string): Promise<{ ok: boolean; msg: string }> {
  const defaultBranch = getDefaultBranch(repoPath);
  const currentBranch = await gitAsync(["rev-parse", "--abbrev-ref", "HEAD"], repoPath);

  if (currentBranch !== defaultBranch) {
    return { ok: false, msg: `on branch '${currentBranch}', expected '${defaultBranch}'` };
  }

  const status = await gitAsync(["status", "--porcelain"], repoPath);
  if (status.length > 0) {
    return { ok: false, msg: "has uncommitted changes" };
  }

  try {
    await gitAsync(["pull", "--rebase"], repoPath);
  } catch (e: any) {
    return { ok: false, msg: `pull failed: ${errorMsg(e)}` };
  }

  return { ok: true, msg: "ready" };
}

const SYMLINK_DIRS = [".me", ".claude"];

function symlinkIgnoredDirs(srcRoot: string, dstRoot: string) {
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === ".venv" || name === "venv") continue;
      const srcPath = join(dir, name);
      if (!statSync(srcPath).isDirectory()) continue;
      if (SYMLINK_DIRS.includes(name)) {
        const rel = relative(srcRoot, srcPath);
        const dstPath = join(dstRoot, rel);
        if (!existsSync(dstPath)) {
          mkdirSync(join(dstRoot, relative(srcRoot, dir)), { recursive: true });
          symlinkSync(srcPath, dstPath);
        }
      } else {
        walk(srcPath);
      }
    }
  }
  walk(srcRoot);
}

async function createWorktreeAsync(repoPath: string, dest: string, branch: string) {
  try {
    await gitAsync(["worktree", "add", dest, "-b", branch], repoPath);
  } catch {
    await gitAsync(["worktree", "add", dest, branch], repoPath);
  }

  const bootstrapDirs = ["node_modules", ".venv", "venv"];
  const bootstrapFiles = [".env", ".env.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".env.production", ".env.production.local"];

  for (const dir of bootstrapDirs) {
    const src = join(repoPath, dir);
    const dst = join(dest, dir);
    if (!existsSync(src) || existsSync(dst)) continue;
    try {
      const proc = Bun.spawn(["cp", "-a", src, dst], { stdio: ["ignore", "ignore", "ignore"] });
      await proc.exited;
    } catch {}
  }

  for (const file of bootstrapFiles) {
    const src = join(repoPath, file);
    const dst = join(dest, file);
    if (!existsSync(src) || existsSync(dst)) continue;
    try {
      await copyFile(src, dst);
    } catch {}
  }

  symlinkIgnoredDirs(repoPath, dest);
}

function StepHistory({ entries }: { entries: string[] }) {
  if (entries.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {entries.map((entry, i) => (
        <Text key={i} color="gray">{entry}</Text>
      ))}
    </Box>
  );
}

type CreateStep = "selectRepos" | "checking" | "name" | "focus" | "creating" | "done";

interface WsCreateProps {
  source: string;
  workspacesDir: string;
}

function WsCreate({ source, workspacesDir }: WsCreateProps) {
  const { exit } = useApp();
  const repos = findRepos(source);
  const [step, setStep] = useState<CreateStep>("selectRepos");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [wsName, setWsName] = useState("");
  const [focusDirs, setFocusDirs] = useState<FocusMap>({});
  const [focusIndex, setFocusIndex] = useState(0);
  const [results, setResults] = useState<{ repo: string; ok: boolean; msg: string }[]>([]);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  if (repos.length === 0) {
    return <Text color="red">no git repos found in {source}</Text>;
  }

  useEffect(() => {
    if (step === "checking") {
      (async () => {
        const issues: { repo: string; ok: boolean; msg: string }[] = [];
        for (const repo of selectedRepos) {
          const result = await prepareRepoAsync(join(source, repo));
          if (!result.ok) issues.push({ repo, ...result });
        }

        if (issues.length > 0) {
          setError(issues.map((r) => `${r.repo}: ${r.msg}`).join("\n"));
          setStep("done");
        } else {
          setHistory((h) => [...h, "repos checked"]);
          setStep("name");
        }
      })();
    }
  }, [step]);

  useEffect(() => {
    if (step === "creating") {
      (async () => {
        const wsDir = join(workspacesDir, wsName);
        mkdirSync(wsDir, { recursive: true });
        writeWsConfig(wsDir, source);

        const claudeMd = join(source, "CLAUDE.md");
        if (existsSync(claudeMd)) symlinkSync(claudeMd, join(wsDir, "CLAUDE.md"));

        for (const dir of SYMLINK_DIRS) {
          const src = join(source, dir);
          if (existsSync(src) && !existsSync(join(wsDir, dir))) symlinkSync(src, join(wsDir, dir));
        }

        const res: { repo: string; ok: boolean; msg: string }[] = [];
        for (const repo of selectedRepos) {
          try {
            await createWorktreeAsync(join(source, repo), join(wsDir, repo), wsName);
            res.push({ repo, ok: true, msg: `focus: ${focusLabel(focusDirs[repo])}` });
          } catch (e: any) {
            res.push({ repo, ok: false, msg: errorMsg(e) });
          }
        }

        writeFocusConfig(wsDir, focusDirs);
        setResults(res);

        if (process.env.TMUX) {
          try {
            const proc = Bun.spawn(["tmux", "new-window", "-c", wsDir, "-n", wsName], { stdio: ["ignore", "ignore", "ignore"] });
            await proc.exited;
          } catch {}
        }

        setStep("done");
      })();
    }
  }, [step]);

  if (step === "selectRepos") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <MultiSelect<string>
          message="select repos"
          options={repos.map((r) => ({ value: r, label: r }))}
          onSubmit={(values) => {
            if (values.length === 0) return;
            setSelectedRepos(values.sort());
            setHistory((h) => [...h, `repos: ${values.sort().join(", ")}`]);
            setStep("checking");
          }}
          onCancel={() => exit()}
        />
      </Box>
    );
  }

  if (step === "checking") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <Spinner message="checking repos" />
      </Box>
    );
  }

  if (step === "name") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <TextInput
          message="workspace name"
          validate={(v) => (v.length === 0 ? "required" : undefined)}
          onSubmit={(name) => {
            setWsName(name);
            setHistory((h) => [...h, `name: ${name}`]);
            setStep("focus");
          }}
          onCancel={() => exit()}
        />
      </Box>
    );
  }

  if (step === "focus") {
    const repo = selectedRepos[focusIndex];
    const repoPath = join(source, repo);
    const dirs = findTopLevelDirs(repoPath);

    if (dirs.length === 0) {
      const next = { ...focusDirs, [repo]: ["*"] };
      setFocusDirs(next);
      setHistory((h) => [...h, `${repo}: everything`]);
      if (focusIndex + 1 < selectedRepos.length) {
        setFocusIndex(focusIndex + 1);
      } else {
        setFocusDirs(next);
        setStep("creating");
      }
      return null;
    }

    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <MultiSelect<string>
          message={`${repo}: focus directories`}
          exclusiveFirst
          options={[{ value: "*", label: "everything", dim: true }, ...dirs.map((d) => ({ value: d, label: d }))]}
          onSubmit={(values) => {
            if (values.length === 0) return;
            const focus = values.includes("*") ? ["*"] : values;
            const next = { ...focusDirs, [repo]: focus };
            setFocusDirs(next);
            setHistory((h) => [...h, `${repo}: ${focusLabel(focus)}`]);
            if (focusIndex + 1 < selectedRepos.length) {
              setFocusIndex(focusIndex + 1);
            } else {
              setFocusDirs(next);
              setStep("creating");
            }
          }}
          onCancel={() => exit()}
        />
      </Box>
    );
  }

  if (step === "creating") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <Spinner message="creating workspace" />
      </Box>
    );
  }

  const wsDir = join(workspacesDir, wsName);
  return (
    <Box flexDirection="column">
      <StepHistory entries={history} />
      {error ? (
        <>
          <Text color="red">{error}</Text>
          <Text color="red">fix the issues above and try again</Text>
        </>
      ) : (
        <>
          <Text bold>workspace: {wsDir}</Text>
          {results.map((r) => (
            <Text key={r.repo}>
              <Text color={r.ok ? "green" : "red"}>{r.ok ? "+" : "x"}</Text>
              <Text> {r.repo}: {r.msg}</Text>
            </Text>
          ))}
          {process.env.TMUX ? (
            <Text color="green">opened tmux window: {wsName}</Text>
          ) : (
            <Text color="gray">cd {wsDir}</Text>
          )}
        </>
      )}
    </Box>
  );
}

type AddStep = "selectRepo" | "checking" | "creating" | "focus" | "done";

interface WsAddProps {
  source: string;
  wsDir: string;
}

function WsAdd({ source, wsDir }: WsAddProps) {
  const { exit } = useApp();
  const repos = findRepos(source);
  const [step, setStep] = useState<AddStep>("selectRepo");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (step === "checking" && isNew) {
      (async () => {
        const repoPath = join(source, selectedRepo);
        const check = await prepareRepoAsync(repoPath);
        if (!check.ok) {
          setError(`${selectedRepo}: ${check.msg}`);
          setStep("done");
        } else {
          setHistory((h) => [...h, `${selectedRepo} checked`]);
          setStep("creating");
        }
      })();
    }
  }, [step, isNew]);

  useEffect(() => {
    if (step === "creating") {
      (async () => {
        try {
          await createWorktreeAsync(join(source, selectedRepo), join(wsDir, selectedRepo), basename(wsDir));
          setStep("focus");
        } catch (e: any) {
          setError(`${selectedRepo}: ${errorMsg(e)}`);
          setStep("done");
        }
      })();
    }
  }, [step]);

  if (step === "selectRepo") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <Select<string>
          message="select repo"
          options={repos.map((r) => ({
            value: r,
            label: r,
            hint: existsSync(join(wsDir, r)) ? "already in workspace" : undefined,
          }))}
          onSubmit={(repo) => {
            setSelectedRepo(repo);
            setHistory((h) => [...h, `repo: ${repo}`]);
            const dest = join(wsDir, repo);
            const repoPath = join(source, repo);
            if (!existsSync(dest)) {
              setIsNew(true);
              setStep("checking");
            } else if (findTopLevelDirs(repoPath).length === 0) {
              setError(`${repo} is already in workspace and has no subdirectories`);
              setStep("done");
            } else {
              setStep("focus");
            }
          }}
          onCancel={() => exit()}
        />
      </Box>
    );
  }

  if (step === "checking") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <Spinner message={`checking ${selectedRepo}`} />
      </Box>
    );
  }

  if (step === "creating") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <Spinner message={`adding ${selectedRepo}`} />
      </Box>
    );
  }

  if (step === "focus") {
    const repoPath = join(source, selectedRepo);
    const dirs = findTopLevelDirs(repoPath);

    if (dirs.length === 0) {
      const existing = readFocusDirs(wsDir);
      existing[selectedRepo] = ["*"];
      writeFocusConfig(wsDir, existing);
      setResult(`${selectedRepo} - focus: everything`);
      setStep("done");
      return null;
    }

    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <MultiSelect<string>
          message={`${selectedRepo}: focus directories`}
          exclusiveFirst
          options={[{ value: "*", label: "everything", dim: true }, ...dirs.map((d) => ({ value: d, label: d }))]}
          onSubmit={(values) => {
            if (values.length === 0) return;
            const focus = values.includes("*") ? ["*"] : values;
            const existing = readFocusDirs(wsDir);
            existing[selectedRepo] = focus;
            writeFocusConfig(wsDir, existing);
            setResult(`${selectedRepo} - focus: ${focusLabel(focus)}`);
            setStep("done");
          }}
          onCancel={() => exit()}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <StepHistory entries={history} />
      {error ? (
        <Text color="red">{error}</Text>
      ) : (
        <Text color="green">{result}</Text>
      )}
    </Box>
  );
}

type DeleteStep = "confirm" | "deleting" | "done";

interface WsDeleteProps {
  source: string;
  wsDir: string;
}

function WsDelete({ source, wsDir }: WsDeleteProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<DeleteStep>("confirm");
  const [results, setResults] = useState<{ repo: string; ok: boolean; msg: string }[]>([]);
  const [history, setHistory] = useState<string[]>([]);

  const [repos] = useState(() =>
    readdirSync(wsDir)
      .filter((name) => {
        if (name === WS_CONFIG) return false;
        try {
          return statSync(join(wsDir, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort()
  );

  const [dirtyRepos] = useState(() =>
    repos.filter((repo) => {
      try {
        return git("status --porcelain", join(wsDir, repo)).length > 0;
      } catch {
        return false;
      }
    })
  );

  if (repos.length === 0) {
    return <Text color="red">no repos in workspace</Text>;
  }

  useEffect(() => {
    if (step === "deleting") {
      (async () => {
        const res: { repo: string; ok: boolean; msg: string }[] = [];
        for (const repo of repos) {
          try {
            const parentRepo = join(source, repo);
            if (existsSync(join(parentRepo, ".git"))) {
              await gitAsync(["worktree", "remove", join(wsDir, repo), "--force"], parentRepo);
            } else {
              rmSync(join(wsDir, repo), { recursive: true, force: true });
            }
            res.push({ repo, ok: true, msg: "removed" });
          } catch (e: any) {
            res.push({ repo, ok: false, msg: errorMsg(e) });
          }
        }
        try {
          rmSync(wsDir, { recursive: true, force: true });
        } catch {}
        setResults(res);
        setStep("done");
      })();
    }
  }, [step]);

  if (step === "confirm") {
    const message = dirtyRepos.length > 0
      ? `uncommitted changes in: ${dirtyRepos.join(", ")}. delete anyway?`
      : `delete workspace ${basename(wsDir)}? (${repos.join(", ")})`;

    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        {dirtyRepos.length > 0 && (
          <Text color="yellow">uncommitted changes in: {dirtyRepos.join(", ")}</Text>
        )}
        <Confirm
          message={message}
          onSubmit={(yes) => {
            if (yes) {
              setHistory((h) => [...h, `confirmed delete: ${basename(wsDir)}`]);
              setStep("deleting");
            } else {
              exit();
            }
          }}
          onCancel={() => exit()}
        />
      </Box>
    );
  }

  if (step === "deleting") {
    return (
      <Box flexDirection="column">
        <StepHistory entries={history} />
        <Spinner message="deleting workspace" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <StepHistory entries={history} />
      <Text bold>delete complete</Text>
      {results.map((r) => (
        <Text key={r.repo}>
          <Text color={r.ok ? "green" : "red"}>{r.ok ? "-" : "x"}</Text>
          <Text> {r.repo}: {r.msg}</Text>
        </Text>
      ))}
    </Box>
  );
}

function parseArgs(): { command: string; source: string; target: string } {
  const args = process.argv.slice(2);
  const command = args[0] || "";
  const rest = args.slice(1);

  if (command === "create") {
    if (rest.length === 1 && PRESETS[rest[0]]) return { command, ...PRESETS[rest[0]] };
    if (rest.length === 2) return { command, source: resolve(rest[0]), target: resolve(rest[1]) };
    console.error("usage: ws create <preset> | ws create <source_dir> <target_dir>");
    console.error(`presets: ${Object.keys(PRESETS).join(", ")}`);
    process.exit(1);
  }

  if (command === "add") {
    const ws = findWsDir();
    if (!ws) {
      console.error("not in a workspace directory (no .ws.json found)");
      process.exit(1);
    }
    return { command, source: ws.source, target: ws.wsDir };
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

const { command, source, target } = parseArgs();

if (command === "create") render(<WsCreate source={source} workspacesDir={target} />);
else if (command === "add") render(<WsAdd source={source} wsDir={target} />);
else if (command === "delete") render(<WsDelete source={source} wsDir={target} />);
