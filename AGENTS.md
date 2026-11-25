# AGENTS.md

Instructions for coding agents working in this repository.

Hikes is a local-first agent harness: a Hono API, an agent loop with real tools, a SQLite store, and a React UI. One command — `hikes` — starts everything.

It is an open-source project by **Hikes Systems**, MIT licensed: [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness).

## Requirements

- **Node 22.18+** (Node 24 recommended). The server runs TypeScript natively via Node's type stripping and uses the built-in `node:sqlite`. There is no build step for the server and no native module to compile.
- **npm**

## Commands

```bash
npm install       # install dependencies
npm link          # put `hikes` on your PATH

hikes             # full harness: API + Vite UI + token + browser
npm start         # the same entry point, no global link needed
npm run dev       # Vite only — needs the API on 8787
npm run dev:api   # API only
npm run typecheck # tsc --noEmit
npm run build     # single-file production build in dist/
```

## Architecture

```
server/
  index.ts       HTTP API, routing, run orchestration — and the `hikes` entry point
  launcher.ts    ports, token, Vite wiring, banner, browser launch
  quiet.ts       silences the node:sqlite experimental warning (must load first)
  auth.ts        loopback guard and token authentication
  config.ts      ConfigStore — the on-disk settings
  db.ts          SQLite schema, FTS5 index, snapshots, digests
  agent/         the agent loop, approval policy, compaction, identity, sub-agents, research
  llm/           Anthropic, OpenAI-compatible and Google adapters
  tools/         web, files, shell, memory and delegation tool definitions
  mcp/           MCP stdio client and server manager
  lib/           diff generation
shared/          types shared by server and UI — protocol, agents, providers
src/             React UI — chat, composer, panels, settings, trail log, run deck
```

The server is authoritative. The browser renders and sends requests; it never decides policy.

## Conventions

- **The product is Hikes.** No other product names in the UI, the CLI, the code or the docs.
- **No emoji.** Every icon is a Lucide icon. Keep it that way — including in documentation and commit messages.
- **Configuration is UI-managed.** Do not introduce environment variables, `.env` files or dotfile configuration. The only exception is the launch-time CLI flags, because the UI cannot start itself.
- **The launcher stays internal.** `hikes` is the only entry point. Do not add external wrapper scripts and do not reintroduce `bin/`.
- **New tools need a risk tier** — `safe`, `write` or `execute`. This drives the approval policy, so a wrong tier is a security bug.
- **Writes must be reversible.** A tool that changes a file on disk snapshots it first, so the step can be reverted.
- **Provider keys never reach the browser.** The API exposes whether a key exists, never the key itself.

## TypeScript constraints

Node runs the server in **strip-only** mode — it removes types without transforming the code. Two consequences:

- **No parameter properties.** `constructor(private x: string)` does not work. Declare the field and assign it in the constructor body.
- **Imports carry the `.ts` extension.** `import { makeDiff } from "./lib/diff.ts"`.

The project compiles under `strict` with `noUnusedLocals` and `noUnusedParameters`.

## Style

- Two-space indentation, double quotes, semicolons, trailing commas in multi-line literals.
- Explicit types on exported functions and interfaces.
- Comments explain **why**, not what. Keep them short and put them above the non-obvious logic.
- Match the surrounding code. There is no linter config, so consistency with the file you are editing is the standard.

## Verification

```bash
npm run typecheck && npm test && npm run build
```

The suite in `tests/` runs on Node's built-in test runner, so there is no extra dependency to install. It covers the config store, the workspace jail and secret rules, diffs, context compaction, the system prompt and memory selection, and the HTTP API against a real server on an ephemeral port. It does not replace exercising the app by hand.

Then run the app with `hikes` and exercise the path you changed — a tool call, a provider switch, a session, a revert. Check the browser console and the terminal output. Try the failure path too: deny an approval, cancel a run, point the agent at an empty workspace. The unhappy path is where most bugs live.

## Never

- Never commit API keys, tokens, `.env` files or a populated `~/.hikes/config.json`.
- Never weaken the loopback guard, the token check, the workspace jail or the SSRF guard.
- Never add a tool that can write outside the workspace.
- Never remove the snapshot that makes a file write revertible.
- Never introduce a second entry point.
- Never make the UI the place where a security decision is made.

## Before you finish

- `npm run typecheck` clean
- `npm test` clean
- `npm run build` succeeding
- The change verified by hand in the running app
- `CHANGELOG.md` updated under `## [Unreleased]`
- `README.md` updated if you changed behaviour

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide, and [SECURITY.md](SECURITY.md) before touching anything security-sensitive.
