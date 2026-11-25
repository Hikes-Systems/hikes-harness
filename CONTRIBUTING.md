# Contributing to Hikes

Thanks for your interest in improving Hikes. This document covers everything you need to get a change from idea to merged pull request.

Hikes is a local-first agent harness: a server, an agent loop, a tool registry and a React interface, all running on the user's own machine. It is an open-source project by **Hikes Systems**, MIT licensed, developed in the public at [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness).

The project is MIT licensed and developed in the open.

**By participating you agree to abide by our [Code of Conduct](#code-of-conduct).**

---

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Before you start](#before-you-start)
- [Setting up](#setting-up)
- [Running Hikes locally](#running-hikes-locally)
- [Tests and checks](#tests-and-checks)
- [Code style](#code-style)
- [Architecture conventions](#architecture-conventions)
- [Commit messages](#commit-messages)
- [Pull requests](#pull-requests)
- [Issues](#issues)
- [Adding a provider](#adding-a-provider)
- [Adding a tool](#adding-a-tool)
- [Adding an MCP server](#adding-an-mcp-server)
- [Adding an agent or sub-agent](#adding-an-agent-or-sub-agent)
- [Security issues](#security-issues)
- [Good first issues](#good-first-issues)

---

## Code of Conduct

Hikes is a welcoming project. Be respectful, assume good faith, and critique code rather than people.

Unacceptable behaviour includes harassment, personal attacks, publishing others' private information, and deliberately dismissive or inflammatory comments. Maintainers may remove comments, commits, issues or pull requests that violate these expectations.

If you see or experience something that breaks this rule, please report it to the maintainers through a private channel — see [Security issues](#security-issues) for how to reach them privately.

---

## Ways to contribute

| Contribution | Examples |
| --- | --- |
| **Bug reports** | Reproduce something that misbehaves, with the exact steps and version |
| **Features** | A new tool, a provider adapter, an MCP integration, a UI capability |
| **Performance** | Frame budget, startup time, memory use, network chatter |
| **Documentation** | README, this file, `SECURITY.md`, inline comments |
| **Manual verification** | An edge case in the agent loop, path safety or the approval policy that nobody has tried yet |
| **Design** | Themes, motion, typography, layout — the interface is a real part of the product |

Good bug reports and design feedback are worth as much as code. Please do not open a pull request before discussing anything substantial.

---

## Before you start

1. **Search existing issues.** The feature may already exist, or already be planned.
2. **Open an issue** for anything larger than a small fix. It is far cheaper to agree on a design in a thread than to review a finished implementation that took the wrong direction.
3. **Check the roadmap** in the README. If your idea is on it, say so — it may already be assigned.

For a **good first issue**, look for anything labelled with it in the issue tracker, or pick a small item from the roadmap list and mention in your issue that you intend to take it. We will assign it to you so two people do not do the same work.

---

## Setting up

### Prerequisites

- **Node 22.18 or newer** — Node 24 is recommended. Hikes runs TypeScript natively and uses the built-in `node:sqlite` module, so there is no transpile step and nothing to compile.
- **npm**
- A model provider key, or a local Ollama install, for manual testing.

### Clone and install

```bash
git clone https://github.com/hikes-systems/hikes-harness.git
cd hikes
npm install
npm link
```

`npm link` puts the `hikes` command on your `PATH`, pointing at `server/index.ts`.

---

## Running Hikes locally

```bash
hikes                                   # API + Vite UI + browser
npm start                               # the same entry point, no global link
npm run dev                             # Vite only — needs the API on 8787
npm run dev:api                         # API only
npm run build && hikes --prod           # serve the built UI
```

For development, `hikes` is the most convenient: it starts the API, starts Vite, wires the two together, mints a token and opens the browser with the token already in the URL.

If you run the API and Vite separately, the API must be on port `8787` — that is what `vite.config.ts` proxies to.

### Where your data goes

Everything is written to `~/.hikes` by default:

```
~/.hikes/
  config.json    workspace, providers, keys, tools, autonomy, MCP servers
  hikes.db       sessions, messages, steps, snapshots, digests, memories
```

Use `--data-dir` to keep a separate profile while testing:

```bash
hikes --data-dir ./.hikes-dev
```

Do not commit `.hikes/` or a `config.json` containing real keys.

---

## Checks

```bash
npm run typecheck    # tsc --noEmit
npm test             # node --test
npm run build        # production single-file build
```

All three must pass before a pull request is opened. The same checks run in CI on every push and pull request, on both Linux and Windows — see `.github/workflows/ci.yml`. A red CI run blocks the merge, so it is faster to run the checks locally first.

The suite lives in `tests/` and uses Node's built-in test runner, so there is nothing extra to install. Add a test with any change to the server, the tools, the prompt or the config: the happy path, the refusal path and the boundary.

### Verifying a change

The suite covers the logic and the API surface; it cannot see the interface. Check the app by hand as well.

- **Run the app.** `hikes` and exercise the path you changed — a tool call, a provider switch, a session, a revert.
- **Check the console.** The browser console and the terminal output are where breakage shows up first.
- **Try the failure path too.** Deny an approval, cancel a run, point the agent at an empty workspace. The unhappy path is where most bugs live.
- **Check the build output.** `npm run build` produces a single self-contained `dist/index.html`; open it and confirm the feature you touched still works.

### What to check by hand

The suite covers path safety, secret-file refusal, config persistence, compaction, diffs and the API contract. These still need a human:

| Area | Check |
| --- | --- |
| **Agent loop** | Tool dispatch, approval pause and resume, denial handling, error paths |
| **Destructive commands** | The patterns that must always ask for approval |
| **Snapshots and revert** | Round-trip restore, conflict detection, created files |
| **MCP** | The JSON-RPC handshake, tool listing and tool calls over stdio |
| **Rendering** | Markdown tables, heading hierarchy, nested lists, code blocks |
| **Prompt cost** | A one-line question stays small; no memory or instruction block is sent without reason |
| **Menus and panels** | The model menu and the tools popover open above the trail log and the run deck |

---

## Code style

There is no linter or formatter config in the repository yet. Match the surrounding code instead:

- **Two-space indentation**, double quotes, semicolons, trailing commas in multi-line literals.
- **Explicit types on exported functions and interfaces.** The project compiles under `strict` with `noUnusedLocals` and `noUnusedParameters`.
- **Comments explain why, not what.** The codebase uses short comments above non-obvious logic — particularly around security decisions and workarounds.
- **Keep functions focused.** Extract a helper when a block needs a comment to explain what it does.
- **No dead code.** Unused exports and commented-out blocks are not merged.

### Two constraints that are easy to trip over

**1. Node runs TypeScript in strip-only mode.** TypeScript parameter properties (`constructor(private x: string)`) are not supported, because Node removes types without transforming the code. Declare the field and assign it in the constructor body:

```ts
// ✗ does not run under Node's type stripping
class Db {
  constructor(private file: string) {}
}

// ✓ correct
class Db {
  private db: SqliteDatabase;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
  }
}
```

**2. Imports carry their file extension.** Server-side imports use the `.ts` extension (`import { makeDiff } from "./lib/diff.ts"`). This is required by `allowImportingTsExtensions` and by Node's resolver.

---

## Architecture conventions

These are the rules that keep the project coherent. They are not suggestions.

- **The product is Hikes.** No other product names in the UI, the CLI, the code or the docs.
- **No emoji.** Every icon in the interface is a Lucide icon. Keep it that way — including in documentation and commit messages.
- **Configuration is UI-managed.** Do not introduce environment variables, `.env` files or dotfile configuration. The only exception is the launch-time CLI flags, because the UI cannot start itself. See [the configuration section of the README](README.md#configuration).
- **The launcher stays internal.** `hikes` must remain the only entry point. Do not add external wrapper scripts, and do not reintroduce `bin/`.
- **New tools need a risk tier.** Every tool declares `safe`, `write` or `execute`. This drives the approval policy — a tool with the wrong tier is a security bug.
- **Writes must be reversible.** A tool that changes a file on disk must snapshot it first so the step can be reverted.
- **The server is authoritative.** The browser never decides policy. Approval, autonomy and tool selection are enforced server-side, not in the UI.
- **Provider keys never reach the browser.** The API exposes whether a key exists, never the key itself.

---

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <short summary>

<body>

<footer>
```

**Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.

**Scopes:** `launcher`, `agent`, `tools`, `mcp`, `memory`, `db`, `api`, `ui`, `providers`, `docs`.

Examples:

```
feat(tools): add file snapshot restore for deleted files
fix(auth): reject non-loopback Origin headers before token check
perf(ui): memoize MessageView to stop re-rendering long transcripts
docs(readme): document the MCP server configuration format
```

Keep the summary in the imperative mood, under 72 characters, with no trailing period. Explain the *why* in the body — the diff already shows the *what*.

---

## Pull requests

1. **Open an issue first** for anything substantial, and link it from the PR.
2. **Branch from `main`:** `git checkout -b feature/short-description`.
3. **Keep it focused.** One concern per pull request. Unrelated refactors make review harder and slow the merge.
4. **Run the checks:** `npm run typecheck && npm run build`, then verify the change in the running app.
5. **Write a clear description.** What changed, why, how you verified it, and anything a reviewer should watch out for.
6. **Update the docs.** If you changed behaviour, update the README, this file, `SECURITY.md` or `CHANGELOG.md` in the same pull request.
7. **Add a changelog entry** under `## [Unreleased]` in `CHANGELOG.md`.

### What a reviewer looks for

- Does the change do one thing, clearly?
- Are the tests meaningful — do they fail without the change?
- Does it follow the architecture conventions above?
- Is a new tool's risk tier right, and is its behaviour covered?
- Does it work on Windows, macOS and Linux?
- Are secrets, tokens and personal data kept out of the diff?

Reviews are collaborative. Expect questions, and expect to be thanked for a good one.

---

## Issues

**Use the right tracker:**

| Kind | Where |
| --- | --- |
| Bug | The issue tracker, with a reproduction |
| Feature request | The issue tracker, with the use case and why it matters |
| Question | The discussions board |
| **Vulnerability** | **Do not open a public issue** — see [Security issues](#security-issues) |

**A good bug report contains:**

- the Hikes version (`hikes --version`) and Node version (`node --version`),
- the operating system,
- what you did, what you expected, and what happened instead,
- the relevant part of the terminal output,
- the session transcript if the bug is in a run — **redact anything sensitive first**.

---

## Adding a provider

1. Add the provider to `ProviderMeta` in `shared/providers.ts`, with a name, tagline, base URL, key hint and docs link.
2. If the provider is OpenAI-compatible, it already works — enable it and point the base URL at the endpoint. Only add an adapter if the wire format differs.
3. A new adapter goes in `server/llm/` and implements the same interface as the existing ones: request shape, streaming parser, tool-calling format and usage reporting.
4. Add the model to the `CATALOG` fallback with `contextWindow` and prices if known.
5. Update the provider table in the README.

The browser must never receive the API key. The provider view exposes `hasKey`, not the key.

---

## Adding a tool

A tool is a `ToolDefinition` with a JSON schema, a handler and a risk tier.

1. Create the definition in the matching file under `server/tools/`.
2. Declare the risk:
   - `safe` — reads only, no side effects outside the process.
   - `write` — modifies a file in the workspace.
   - `execute` — runs a command or an external process.
3. If it writes a file, snapshot the original content first so the step can be reverted.
4. If it executes something, add the pattern to `isDestructiveCommand` if it should always ask for approval.
5. Register it in `buildToolRegistry` and add the label and detail strings in `server/tools/index.ts`.
6. If it needs a capability outside the four tool families, add a flag to `ToolFlags` in `shared/protocol.ts` and a toggle in **Settings → Agent**.
7. Write tests: the happy path, the refusal path, and the boundary.

---

## Adding an MCP server

MCP support is already built in — you do not need to write code.

1. Open **Settings → MCP**.
2. Give the server a name, a command, arguments and environment variables.
3. Press **Test** to connect and list the tools it exposes.
4. Enable it.

The tools appear as `mcp__<server>__<tool>` and ask for approval in Ask first and Balanced modes. Server definitions live in `~/.hikes/config.json` under `mcp.servers`.

If a server does not connect, the error is shown in the panel and the server is skipped — the run continues without it.

---

## Adding an agent or sub-agent

**Built-in agents** live in `shared/agents.ts` with an id, a name, a one-line description and a system prompt. Add a default mascot from `src/lib/mascots.ts` if you want a distinct icon, and a `DEFAULT_MASCOT` entry for it.

**Sub-agents** live in the same file as `SubAgentDef` entries with an explicit tool allowlist. An empty `tools` array means every enabled tool. Sub-agents do not receive the delegation tool, so nesting cannot recurse.

Both are shared with the browser, so changing a prompt changes behaviour everywhere the agent is offered.

---

## Security issues

**Do not open a public issue for a vulnerability.** Report it privately — the full process, including our response timeline, is in [`SECURITY.md`](SECURITY.md).

---

## Good first issues

If you are new to the project, these are approachable starting points:

- Add a model to the fallback catalog in `shared/providers.ts`.
- Harden an edge case in the agent loop or the path-safety helpers.
- Improve an error message so it tells the user what to do next.
- Add a theme preset or refine the paper and ink colour scales.
- Expand the `recall` tool description, or add a tool detail string that reads better in the UI.

Say in the issue that you would like to take it, and we will assign it to you.

---

## Licence

By contributing, you agree that your contributions will be licensed under the [MIT Licence](LICENSE), the same licence as the rest of Hikes.
