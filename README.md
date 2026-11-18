# Hikes

A local-first agent harness. One command starts a backend, opens a browser UI, and gives an agent real tools — web search, workspace files, a shell, and persistent memory. Sessions and keys stay on your machine.

The UI is the Ridgeline liquid-glass chat. The product and CLI are **Hikes**.

## Requirements

- **Node 22.18+** (Node 24 recommended — the harness uses native TypeScript execution and `node:sqlite`)
- npm
- A model provider: a cloud API key, **Ollama**, or any OpenAI-compatible endpoint. There is no demo mode.

## Quick start

```bash
npm install
npm run build      # optional, only needed for --prod
npm link           # puts `hikes` on your PATH

cd ~/projects/some-folder
hikes
```

`hikes` starts the API and the web UI, prints a fresh session token, and opens your browser. On first launch the folder you run it from becomes the agent's **workspace** — that is where file tools and shell commands operate. The UI remembers the workspace you pick in **Settings → Agent**, and `--workspace <dir>` overrides it for a launch.

There is **no environment configuration and no `.env` file**. Everything — provider keys, search keys, default model, tools, autonomy, workspace — is managed in the web UI and stored on the server. The only launch-time options are the CLI flags listed below, because the UI cannot start itself.

## Providers

| Provider | Notes |
| --- | --- |
| Anthropic | Claude models, `sk-ant-…` key |
| OpenAI | GPT models, `sk-…` key |
| Google Gemini | Gemini models, `AIza…` key |
| DeepSeek | DeepSeek Chat / Reasoner, `sk-…` key |
| OpenRouter | One key for many models |
| Ollama | Local models, no key. Run `ollama pull llama3.2` first |
| Custom endpoint | LM Studio, vLLM, llama.cpp — anything with an OpenAI-compatible `/chat/completions` |

Model lists come from the provider when possible, with a built-in fallback catalog. Free models are listed first and marked **Free**; this is most useful on OpenRouter. Pick a default model in Settings → Agent; the choice is stored on the server.

**Test connection** performs a real authenticated request (OpenRouter keys are checked against `/key`, and custom endpoints must complete a minimal request). A key the provider rejects is never saved. Testing also refreshes the model catalog, with free models first.

## CLI

```
hikes [options]

  -p, --port <n>        Web UI port (default 5173)
      --api-port <n>    API port (default 8787)
  -w, --workspace <d>   Initial workspace folder (default: last UI choice, else cwd)
      --data-dir <d>    Where sessions, memory and keys live (default: ~/.hikes)
      --model <key>     Default model, e.g. openai:gpt-4.1
      --token <token>   Use a specific session token
      --prod            Serve the built UI instead of the Vite dev server
      --no-open         Don't open the browser
      --no-auth         Disable token auth (not recommended)
  -v, --version         Print version
  -h, --help            Show help
```

If the requested port is taken, the launcher picks the next free one and prints the actual URL. `--prod` requires `npm run build` first.

### The token

Every launch prints a `hsk_…` token and opens a URL with `#hikes_token=…`. The UI reads it, stores it in `localStorage`, and strips it from the address bar. Restarting `hikes` creates a new token, so open the link it prints (or pass `--token` to keep a known one).

## Tools

| Tool | Risk | What it does |
| --- | --- | --- |
| `web_search` | safe | DuckDuckGo by default; Tavily or Brave when a search key is saved |
| `fetch_url` | safe | Reads a public page and returns readable text |
| `list_files` | safe | Lists a directory in the workspace, skipping secrets |
| `read_file` | safe | Reads a workspace file (size-capped) |
| `search_files` | safe | Content search across the workspace |
| `write_file` | write | Creates or replaces a workspace file |
| `run_command` | execute | Runs PowerShell (Windows) or bash, in the workspace |
| `remember` / `recall` | safe | Long-term memory stored in SQLite |

Tools are toggled in the composer or in Settings → Agent. Changes are saved on the server and apply to future runs, including after a restart. Every tool call is streamed into the UI with its output, duration, and result.

### Autonomy

| Mode | Behavior |
| --- | --- |
| **Ask first** | Every tool call waits for approval |
| **Balanced** (default) | Reads run automatically; writes and commands ask |
| **Autonomous** | Everything runs automatically, except clearly destructive commands (disk format, `rm -rf` roots, diskpart, `git reset --hard`, `drop database`, …) |

Approval requests pause the run. Allow or deny from the chat card; denials are fed back to the model so it can adapt.

## Where things live

```
~/.hikes/
  config.json    provider settings, search keys, workspace, tools, autonomy (0600)
  hikes.db       sessions, messages, tool steps, memories (SQLite)
```

There are no environment overrides. The server writes `config.json` whenever settings change in the UI (or when a launch flag such as `--workspace` supplies a new value).

## Security model

Hikes is a **local** tool with real capabilities, not a sandbox.

- The server binds to `127.0.0.1` only and rejects non-loopback `Host` / `Origin` headers (DNS-rebinding guard).
- API requests require the launch token (bearer header, `x-hikes-token`, or `?token=`).
- Keys are stored server-side in `~/.hikes/config.json` (plain text, file mode `0600`) and never shipped to the browser. Shell children get a scrubbed environment, so provider keys are not visible to commands.
- File tools are jailed to the workspace, including symlink checks, and refuse to read `.env`, SSH keys, certificates and similar secrets.
- `fetch_url` blocks private/loopback addresses and non-HTTP schemes (SSRF guard).
- Shell commands run with your user's privileges. The workspace only sets the working directory — an approved command can still reach other paths. That is why commands ask by default, and why destructive patterns still ask in Autonomous mode.

## Tips

- **Ollama:** `ollama pull llama3.2`, then enable Ollama in Settings → Providers. The harness talks to it server-side, so no CORS setup is needed.
- **LM Studio / vLLM:** use **Custom endpoint**, set the base URL (usually `http://localhost:1234/v1`) and the model name.
- **Search rate limits:** add a Tavily or Brave key; DuckDuckGo works but is rate-limited.
- **Ports busy:** the launcher scans upward and prints the URL it actually used.
- **Token missing:** restart `hikes` and open the fresh link, or launch with `--token mytoken` and open `http://127.0.0.1:5173/#hikes_token=mytoken`.

## Development

```bash
npm run dev        # Vite only — the UI still needs a `hikes` API on 8787
npm run dev:api    # API only, using built-in defaults
npm run typecheck
npm test           # node:test — auth, path safety, destructive commands, config
npm run build      # single-file UI in dist/
```

The supported dev flow is still `node bin/hikes.mjs` (or `npm start`), which wires the Vite UI to the API and injects the token for you.

```
bin/hikes.mjs        launcher: ports, token, Vite, browser
server/              Hono API, agent loop, LLM adapters, tools, SQLite
shared/              types shared by server and UI (providers, protocol, agents)
src/                 React UI (Ridgeline)
```

Runs stream to the browser as NDJSON: `run.start`, `step.start`, `step.done`, `text.delta`, `tool.approval`, `usage`, `run.end`, plus `error`. Sessions are written to SQLite as they go, so closing the tab does not lose history.
