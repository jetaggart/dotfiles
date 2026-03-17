---
name: ws
description: Workspace manager tool architecture, shared Ink core components, and conventions for adding new commands or tools.
invoke: auto
globs:
  - "tools/scripts/ws.tsx"
  - "tools/core/**"
---

<architecture>
ws is a git worktree-based workspace manager built with Ink (React for CLI). it lives at `tools/scripts/ws.tsx` and uses shared prompt components from `tools/core/`.

each ws command (create, add, delete) is a React component with a `step` state that advances through prompt phases. this is the state machine pattern: define a union type for steps, render the component for the current step, and advance on submit.

<example>
type CreateStep = "selectRepos" | "checking" | "name" | "focus" | "creating" | "done"

function WsCreate({ source, workspacesDir }: WsCreateProps) {
  const [step, setStep] = useState<CreateStep>("selectRepos")

  if (step === "selectRepos") {
    return (
      <MultiSelect
        message="select repos"
        options={repos.map((r) => ({ value: r, label: r }))}
        onSubmit={(values) => {
          setSelectedRepos(values)
          setStep("checking")
        }}
        onCancel={() => exit()}
      />
    )
  }
  // ... next steps
}
</example>
</architecture>

<core_components>
shared Ink prompt components live in `tools/core/`. all follow the same pattern: accept `message`, `onSubmit(value)`, and optional `onCancel()` props. they manage their own internal state and use `useInput` for key handling.

- `Select<T>` — single selection with j/k navigation, enter to submit
- `MultiSelect<T>` — checkboxes with space toggle, `a` for select all, enter to submit
- `TextInput` — text input with optional `validate` function, backspace, enter to submit
- `Confirm` — y/n prompt, esc to cancel
- `Spinner` — braille animation with message text
- `git(args, cwd)` — execSync wrapper returning trimmed stdout
- `errorMsg(e)` — extract message from caught errors

import from the barrel: `import { Select, MultiSelect, Spinner, git } from "../core/index.ts"`
</core_components>

<async_work>
for steps that run synchronous blocking work (git commands, filesystem ops), wrap in `setTimeout(() => { ... }, 0)` inside a `useEffect` so React paints the spinner frame before blocking.

<example>
useEffect(() => {
  if (step === "checking") {
    setTimeout(() => {
      const result = prepareRepo(repoPath)
      if (result.ok) setStep("name")
      else { setError(result.msg); setStep("done") }
    }, 0)
  }
}, [step])
</example>
</async_work>

<pure_logic>
keep all non-UI functions pure. git helpers, filesystem queries, config readers/writers, and repo preparation logic stay as plain functions outside React components. only the interactive prompt flow uses React/Ink.

key pure functions in ws.tsx: `findRepos`, `findTopLevelDirs`, `findWsDir`, `prepareRepo`, `createWorktree`, `writeFocusConfig`, `readFocusDirs`, `getDefaultBranch`
</pure_logic>

<adding_commands>
to add a new ws command:
1. define a step union type for the command's flow
2. create a React component that renders the appropriate core prompt for each step
3. store intermediate results in state, advance step on submit
4. add the command to `parseArgs()` and the render block at the bottom of the file
</adding_commands>

<adding_tools>
to add a new CLI tool using the shared core:
1. create `tools/scripts/<name>.tsx`
2. import components from `../core/index.ts`
3. add a build script to `tools/package.json` following the existing pattern
4. add the build step to the `build` script
</adding_tools>

<ws_config>
workspaces store a `.ws.json` file with `{ "source": "/path/to/parent" }` linking back to the source repo directory. focus directories are written to `CLAUDE.local.md` in `<focus>` blocks. a `.code-workspace` file is also generated for VS Code.
</ws_config>
