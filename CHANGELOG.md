# Changelog

All notable changes to **Hikes** are documented in this file.

Hikes is an open-source project by **Hikes Systems** — [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.2] — 2026-11-25

### Added

- **Automatic personal memory.** A bounded server-side post-pass saves explicit durable user facts and preferences, with duplicate suppression, secret filtering, attachment exclusion and a Memory settings toggle. Disabling the Memory tool family now stops both memory reads and writes.
- **Existing MCP discovery.** Hikes imports supported local servers from existing OpenCode JSON/JSONC configurations on first launch and through **Settings → MCP → Detect existing**, without using OpenCode code, its SDK or its runtime. Concurrent runs share single-flight MCP connections.

### Changed

- **One primary Hikes agent.** The persona picker, alternate built-ins, custom names and mascot settings are retired. Legacy session agent ids resolve to Hikes, whose product prompt now consistently uses the Hikes name. The favicon and interface artwork are tightly cropped and enlarged across the top bar, welcome screen, conversation header, chat, gate and wizard.
- **Server-owned policy.** Run tools and autonomy now come from the server's saved settings rather than trusting browser-supplied policy.
- **Six-palette workspace.** Daylight, Porcelain and Sage provide distinct premium light surfaces; Cinema, Graphite and Plum provide coordinated dark alternatives. Each palette has its own surfaces, hairlines, accent and static ambience, with readable secondary text.
- **Flexible session navigation.** Sessions can dock in the left sidebar, open in a drop-down panel below the top bar, or stay hidden until requested. The preference persists and `Ctrl B` toggles the selected layout.
- **Clearer visual hierarchy.** A direct top-bar palette menu replaces the two-state theme button, welcome actions are purposeful task cards instead of a nested tray, user turns have a proper You label, session rows show message counts instead of repeating Hikes, and activity/settings typography is easier to read. Light-theme overlays are translucent and their shadows are visible again. The README showcase now uses the new Daylight welcome and diff-review screens.
- **Refined shell and controls.** A floating top bar, rounded workspace panels, a larger welcome layout and Manrope with IBM Plex Mono replace the field-ledger shell. Buttons and icon controls have subtle hover/press feedback, toggles glide smoothly, and reduced-motion preferences disable the movement. The composer has one clean focus halo—without a duplicate textarea outline or layout shift—and tactile send feedback.

---

## [1.0.1] — 2026-11-20

This is the largest change set in the project so far. It covers the review-and-revert workflow, context management, telemetry, MCP support, memory search, the internal launcher, and a full interface rebuild around a local-first field ledger.

### Added

#### Showcase

- **Showcase images.** The README now opens with the welcome screen and a live run, so the project can be seen before it is read. Both images are captured from the running app.

#### Review and revert

- **File snapshots.** Every `write_file` and `edit_file` call now records the original contents in a new `file_snapshots` table, keyed by session, step and path.
- **Inline diffs.** Changed files are summarised directly on the step row — path, additions, deletions — with the full unified-style hunk available in the step expander.
- **One-click revert.** `POST /api/sessions/:id/steps/:stepId/revert` restores the content from before the first change in a step.
- **Conflict detection.** A revert is refused with `409` when the file on disk no longer matches what the step produced, when the file was removed, or when the path resolves outside the workspace. Hand edits are never silently overwritten.
- **Per-path grouping.** A step that touched the same file several times is reverted as one unit: the expected content is the result of the last change, the restored content is the state before the first.
- **Created-file handling.** Reverting a step that created a file deletes the file again.
- **Revert UI.** Each step with file changes gets a **Revert** button and a reverted-state label.

#### Context management

- **Automatic compaction.** When the estimated prompt passes 78% of the model's context window, older turns are folded into a compact local digest. The last 6 turns are always kept verbatim.
- **Local, deterministic digests.** Compaction is extractive and happens locally — no extra model call, no surprise cost.
- **Persistent digests.** Digests are stored in a new `context_digests` table and reused across runs instead of being rebuilt.
- **Visible compaction.** Compaction appears as a `compact` step in the transcript. The full session history is never deleted.
- **Manual compaction.** `POST /api/sessions/:id/compact` and a **Minimize2** button in the toolbar compact on demand.

#### Telemetry

- **Token counts per message.** Input, output and total tokens are reported on every assistant message.
- **Cost estimates.** Estimated USD cost per message and per run, calculated from list prices.
- **Inspector statistics.** The run deck now shows context usage as a share of the model's context window, plus session totals for tokens and cost.
- **Pricing metadata.** `shared/providers.ts` now carries `contextWindow`, `inputPrice` and `outputPrice` per model.

#### MCP support

- **MCP client.** `server/mcp/client.ts` implements a stdio JSON-RPC client that starts a server process, performs the `initialize` handshake and lists tools.
- **MCP manager.** `server/mcp/manager.ts` owns server lifecycle, status and tool registration.
- **Tool namespacing.** MCP tools join the registry as `mcp__<server>__<tool>` and are treated as `execute` risk, so they ask for approval in Ask first and Balanced modes.
- **Graceful failure.** A server that fails to start is skipped with a visible error instead of breaking the run.
- **Settings panel.** A new **MCP** tab in Settings manages servers and lists the tools each one exposes.
- **Windows launching.** Commands are launched through `cmd.exe /d /s /c` with verbatim arguments so quoting behaves as the command line expects.

#### Memory

- **FTS5 hybrid search.** Memories are indexed in a standalone `memory_fts` table kept in sync with SQLite triggers.
- **BM25 ranking with a substring fallback.** A query that the FTS index misses still matches by substring, so partial words and exact substrings find their entry.
- **Searchable memory panel.** A search box in **Settings → Memory** queries the same index as the `recall` tool.

#### Backend hardening

- **Response headers.** Every response carries a `Content-Security-Policy` (inline code and the font CDN are the only exceptions, because the production build is a single file), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and `Cross-Origin-Opener-Policy: same-origin`. The loopback guard and the token check are untouched.
- **Body ceiling.** A request body above 4 MB is refused with `413` before a route reads it.
- **Rate limits.** Fixed windows on the run endpoint (120/min), provider and MCP verification (30/min) and writes (600/min), answering `429` with `Retry-After`. A global cap of four concurrent runs sits on top of the one-run-per-session rule.
- **Richer health.** `/health` reports uptime, active runs, session count and memory count next to the version.
- **Provider retries.** `server/llm/types.ts` gained `fetchWithRetry`: a timeout that only covers the wait for the response to start, one retry on `408`, `425`, `429` and `5xx` with exponential backoff, `Retry-After` respected, and immediate cancellation when the user stops the run. A long stream is never cut in half — only a provider that never answers is.
- **Database hygiene.** `busy_timeout` and `synchronous = NORMAL` pragmas, a `PRAGMA quick_check` at start-up that logs damage instead of failing later, and `PRAGMA optimize` on close.
- **Ordered shutdown.** Closing the server aborts in-flight runs, resolves pending approvals and stops MCP servers before the database closes, so `Ctrl+C` cannot leave a sub-process behind.
- **Tool timeouts.** `fetch_url` and the search APIs now run under a 15-20s ceiling composed with the run's own cancellation, so a site that accepts a connection and then says nothing can no longer hold a run open. Bodies are still read through the existing size cap.
- **Application icon.** `assets/hikes-icon.png` is the app mark, with an inverted `hikes-icon-dark.png` for dark browser chrome and 96px `hikes-mark*` rasters for the interface itself. `index.html` declares the favicon and touch icon.
- **Static assets.** The shell route now serves real files from the build output — the icon rasters, fonts and any future asset — and only falls back to `index.html` for unknown paths. Resolution is confined to the build directory, so a `..` segment cannot read a file outside it.

#### Interface

- **Field-ledger redesign.** The interface was rebuilt as a workbench instead of a console: a 48px top bar, a 248px session index on the left, a paper-white reading column in the middle and a 300px activity ledger on the right. The dark evergreen instrument rail, the marketing-style empty screen, the five equal suggestion cards and the stat-card run deck are gone.
- **One accent, one grey family.** The palette is neutral paper and charcoal with a single ember accent (#b45309 by day, #f0a33c at night). The mint and pine greens, the display face and the decorative gradients are gone; radii are limited to 4px for controls, 6px for panels and dots.
- **Paper and Night themes.** Two complete themes replace the scene and wallpaper controls. Paper is the neutral default; Night is a charcoal variant for low light. A Sun/Moon control in the top bar switches between them instantly.
- **Ruled transcript.** Messages are entries with hanging margin labels (You / Hikes) on a hairline rule, not chat bubbles. The empty screen is a work prompt — agent, workspace, one task line and three suggested tasks — rather than a 64px greeting.
- **Settings as a panel.** Settings opens over the workspace with a plain section list, a single scrolling panel and an explicit **Done** button. *Look* became **Appearance**, now holding theme and motion only.
- **Mascot picker.** Agents can be renamed and given one of 16 Lucide mascots.
- **Markdown renderer.** The transcript now renders GFM tables, task lists, a full heading scale, nested lists, rules and syntax-highlighted code on both themes.
- **Task lists.** `- [ ]` and `- [x]` render as real checkboxes, with completed items struck through, instead of leaking the bracket syntax into the answer.

#### Agent identity and answer quality

- **Hikes product identity.** `server/agent/identity.ts` adds a system-prompt block that is injected into **every run** — every new session and every prompt — explaining what Hikes is, what it can do, and how the agent must refer to it.
- **"You are not Hikes" rule.** The default agent is also named *Hikes*, so the model had no way to tell the agent from the product and kept writing "Hikes (you)". The identity block now states the distinction explicitly and forbids the first-person and second-person forms.
- **Third-person product references.** The agent is told to refer to the harness as "Hikes", "the Hikes harness" or "the app", and — when comparing harnesses — to treat Hikes as a subject being compared rather than as the speaker.
- **Agent persona reframed.** The persona line changed from `You are <name>` to `You are the <name> agent`, so the agent never claims to *be* the harness.
- **Output rules in the prompt.** The model is instructed to match answer length to the question, use real Markdown headings, keep paragraphs to one to three sentences, use tables for comparisons, lead with the answer, and not pad.
- **Sub-agent identity.** Sub-agents receive the same product framing in a condensed form.
- **Attribution on request.** The identity block states that Hikes is open source by Hikes Systems, MIT licensed, at [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness), and instructs the agent to volunteer that — with an invitation for issues and pull requests — whenever the user asks where to find Hikes, who made it, or whether they can use or contribute to it.
- **Markdown tables.** The renderer now parses GFM pipe tables — header row, delimiter row, cell alignment and escaped pipes — with styled headers, zebra striping and horizontal scrolling on narrow screens.
- **Heading hierarchy.** `h1` through `h6` now render as distinct elements with a real size scale, instead of every level collapsing to the same `h3`.
- **Horizontal rules and setext headings.** `---`, `***` and `___` render as rules; `Title` underlined with `===` or `---` renders as a heading; the common `--- Title` form models use instead of a heading is handled too.
- **Nested lists.** Indented bullets and numbered items now nest correctly instead of flattening.
- **Larger reading size.** Markdown body text moved from 15.5px to 16.5px with a slightly looser line height, then settled at 15px with a 1.7 line height in the field-ledger layout.

#### Launcher and entry point

- **Internal launcher.** `server/launcher.ts` now owns port selection, token minting, Vite wiring, the banner and browser launch. There is no external wrapper script.
- **`hikes` command.** `package.json` declares `bin.hikes` pointing at `server/index.ts`, so `npm link` puts a single `hikes` command on `PATH`.
- **Symlink-safe main detection.** The entry point resolves both `process.argv[1]` and `import.meta.url` through `fs.realpathSync.native`, because `npm link` runs the file through a symlink.
- **Second-launch reuse.** A later `hikes` reads `runtime.json` from the data directory and opens the instance that is already serving, instead of starting another one on the next free port.

#### Distribution

- **Trusted npm publishing.** A GitHub Actions workflow verifies and builds releases before publishing to npm through OIDC.
- **npm package contents.** Packing and publishing build the UI and include the runtime files needed by the CLI.
- **npm installation instructions.** The README now documents global and project-local npm installs.

#### Reliability

- **Onboarding state on the server.** `onboarded` now lives in `~/.hikes/config.json` and arrives through `/api/bootstrap`, so setup is a property of the machine rather than of one browser origin.
- **Interface mirror.** The browser-only state — profile, theme, motion, agent names and research mode — is mirrored to the server and restored on a new origin. Local state always wins when it exists.

#### Workspace instructions

- **`AGENTS.md`.** The repository now ships an `AGENTS.md` at the root, following the cross-tool convention. Any agent — Hikes, OpenCode, Claude Code, Cursor — picks it up.
- **`.hikes/hikes.md`.** A Hikes-specific workspace instruction file, read automatically alongside `AGENTS.md` and included in the system prompt of every run in that workspace.
- **Wider lookup.** The workspace instruction loader now checks `AGENTS.md`, `HIKES.md`, `.hikes/AGENTS.md` and `.hikes/hikes.md`, in that order.

#### Documentation

- **Full open-source README.** A complete rewrite covering features, architecture, the HTTP API, the security model, contribution guidelines and the roadmap.
- **`CONTRIBUTING.md`, `CHANGELOG.md` and `SECURITY.md`** added.
- **Open-source attribution.** The README, the licence, `package.json` and every project document now name **Hikes Systems** as the author and point at [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness). The `LICENSE` copyright was transferred to Hikes Systems.
- **Product identity document.** `server/agent/identity.ts` is the single source of truth for what the agent knows about Hikes and how it refers to the product.
- **CI workflow.** GitHub Actions runs typecheck, tests and build on Linux, and typecheck and tests on Windows, on every push and pull request.
- **`Referrer-Policy: no-referrer`.** The interface declares it explicitly, so the launch token in the URL can never travel in a `Referer` header.

### Changed

- **The interface is flat by design.** Every `backdrop-filter`, the SVG displacement filter, the animated mountain layers and the rim copy were removed with the glass shell. There is nothing left to re-raster per frame, so the app holds its frame rate on integrated graphics and the theme switch is instant.
- **No background-tab work.** With the wallpaper gone there is no animation loop to pause, so a hidden tab costs nothing. Message and panel motion still eases in only while the tab is visible.
- **Prompts cost less.** The product identity block was cut by more than half without losing a rule. Memories are searched for relevance instead of all thirty being sent on every request, and the workspace instruction budget is capped.
- **The workspace instructions load once, not on every message.** `AGENTS.md` and `.hikes/hikes.md` were the heaviest thing in the prompt — roughly 2,500 tokens in a typical repository — and they were sent with every message, including "how are you?". They are now loaded the first time a conversation turns to the project and kept for the rest of that session. Until then the agent is told which files to read. A simple chat now costs about 2,700 tokens instead of 4,600.
- **The provider can cache the prompt.** The identity, the rules and the tool definitions are identical on every request, so they are marked as a cache breakpoint and served from the provider's cache at a tenth of the price on Anthropic, and automatically on OpenAI-compatible endpoints that support it. The interface now shows how much of a prompt came from the cache.
- **Real token counts instead of a guess.** The usage counters were only requested from three providers, so every other provider showed an estimate. They are now requested from all of them, with a fallback for servers that do not understand the field, and the estimate includes the tool schemas that really travel with the request.
- **Typography.** The app uses **IBM Plex Sans** for the interface and prose and **IBM Plex Mono** for labels, numbers and code. There is no display face.
- **Launch token in the query string.** The launcher opens `?hikes_token=…` instead of `#hikes_token=…`. The client still accepts the legacy hash form and `?token=`, and strips all three from the address bar.
- **Simplified banner.** The terminal banner no longer prints the model or the enabled tools.
- **Command palette.** Now opens any settings tab directly, and the `SettingsTab` type moved to `src/components/Settings.tsx` so the palette and the settings modal cannot drift apart.
- **Shell output limits.** Command output is now capped at 30,000 characters *and* 500 lines, with truncation reported to the model.
- **`Regenerate` button.** Only rendered on the last assistant message.
- **Atomic config writes.** Settings are written to a temp file and renamed into place.
- **One version source.** `package.json` is now the only place the version is written. The launch banner, `hikes --version`, the `/health` response and the MCP client handshake all read it through the new `server/version.ts`, so a release bump cannot leave one of them behind.
- **Hikes-only branding.** The README title and the launch banner now read **Hikes**. `hikes-harness` is only the repository name; it is no longer used as a second product name in the interface or the docs.
- **Providers carry their own logo.** The provider list showed a single letter on a coloured tile. Each provider now shows its real mark — Anthropic, OpenAI, Gemini, DeepSeek, OpenRouter, Ollama — drawn as vector paths so they stay sharp at any size, with a Lucide plug for the custom endpoint.

### Removed

- **`bin/hikes.mjs`.** The external launcher script was deleted. All launching now happens inside the server entry point.
- **Static `node:sqlite` import.** The database module loads `node:sqlite` on demand so the experimental warning can be silenced first.
- **The legacy `ridge` agent id.** The alias, the database migration, the `ridgeline:v1` localStorage key and every reference to the old name are gone. `hikes` is the only identity. Unknown agent ids now fall back to the generalist instead of being translated.
- **The wallpaper and glass layer.** `Wallpaper.tsx`, `Scene.tsx`, `GlassShell.tsx`, `GlassLens.tsx`, `Glass.tsx` and the `scenes`, `wallpaper`, `lens` and `quality` helpers were deleted, and the `liquid-glass-react` dependency was removed. There is no wallpaper, no scene cycle and no lens; the page itself is the surface.
- **Scene and wallpaper settings.** The old `scene`, `quality` and `wallpaper` fields were replaced by a single `theme` field. Stored v2 state migrates profile, agent names, tools, autonomy and research mode; anything tied to the removed appearance model is dropped.
- **`/test` API route paths.** `POST /api/providers/:id/test` is now `POST /api/providers/:id/verify`, and `POST /api/mcp/servers/:id/test` is now `POST /api/mcp/servers/:id/verify`. The behaviour is unchanged; only the paths read as product routes rather than scaffolding.

### Fixed

- **Noisy SQLite warning.** Node's `ExperimentalWarning: SQLite is an experimental feature` printed on every launch. `server/quiet.ts` patches `process.emitWarning` before the module loads, and `node:sqlite` is required lazily so the patch is always in place.
- **Launcher banner.** The model and tool lines were removed.
- **Session title truncation.** Session names are normalised before being written.
- **Runs no longer die at the tool-call ceiling.** A run that hit the round limit used to fail outright with *"Stopped after 8 tool rounds… Try a narrower request or ask me to continue."* The limit is now 12 rounds, and on reaching it the model gets one final turn with the tools removed so it writes the answer from what it already gathered. The run ends successfully instead of leaving the user to type "continue".
- **Tables and headings rendered as plain text.** Markdown tables had no renderer at all, so every comparison collapsed into a paragraph of pipe characters, and all heading levels rendered identically.
- **`hikes --version` printed `0.0.0` outside the project directory.** The launcher looked for `package.json` in the working directory rather than in the package root, so the version was wrong whenever the command was run from anywhere else. The package root is now resolved from the module's own location.
- **The model menu opened underneath the rest of the app.** It is portalled to `document.body` and positioned from the composer's rectangle, so neither the trail log nor a transformed ancestor can cover or clip it. The tools popover gets the same treatment.
- **A launch on a different port put the user back through onboarding.** Browser storage is scoped to an origin, and the origin includes the port, so the wizard reappeared with every existing session hidden behind it. The flag is now server-side.
- **The composer grew without limit.** A long paste pushed the transcript off the screen and only then produced a scrollbar. The input now stops at four lines and scrolls inside the box, with a thin translucent scrollbar that matches the theme instead of the white one Chromium draws by default.
- **The launch token page showed the old URL format.** It printed `http://127.0.0.1:5173/#hikes_token=…` while the launcher has used the query string for a while.
- **The version was printed without its prefix.** The About panel, the run deck and `hikes --version` now read `v1.0.1` instead of `1.0.1`.
- **The welcome screen printed the whole workspace path.** It now shows the folder name only, so the user's home directory is not on screen by default. The full path is still in Settings and in the run deck.

### Security

- **Token in the query string.** The launch token is no longer placed in the URL fragment, keeping it out of server-side request logs and proxy logs.
- **Loopback and origin checks** are unchanged and still enforced on every request.

---

## [1.0.0] — 2026-11-18

The initial public release of Hikes.

### Added

- **Local-first harness.** One command starts a Hono API, serves the React UI and opens the browser.
- **Seven providers.** Anthropic, OpenAI, Google Gemini, DeepSeek, OpenRouter, Ollama and any OpenAI-compatible custom endpoint, with live model discovery and a built-in fallback catalog.
- **Connection testing.** A real authenticated request is made before a key is saved.
- **Eleven built-in tools** across web search, page fetching, workspace files, shell commands and long-term memory.
- **Three autonomy modes** — Ask first, Balanced and Autonomous — with approval cards and a hard block on clearly destructive commands.
- **Sessions in SQLite.** Full transcripts, tool steps and sources are persisted as they stream.
- **Agent loop with streaming.** NDJSON events: `run.start`, `step.start`, `step.done`, `text.delta`, `tool.approval`, `subagent.start`, `subagent.update`, `research.phase`, `usage`, `run.end`.
- **Four built-in agents** — `hikes`, `scout`, `forge`, `quill` — each with a distinct system prompt.
- **Five sub-agents** — `researcher`, `coder`, `analyst`, `writer`, `planner` — with scoped tool access.
- **Deep research pre-pass** that gathers evidence before the model answers, with sources attached.
- **Liquid-glass interface.** Animated parallax scenes, wallpapers, a glass lens, a command palette and a run inspector.
- **Token-authenticated local API** with a loopback-only guard against DNS rebinding.
- **Workspace jail** for file tools, including symlink checks and refusal to read `.env` files, SSH keys and certificates.
- **SSRF guard** on `fetch_url`.
- **MIT licence.**

[1.0.2]: https://github.com/hikes-systems/hikes-harness/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/hikes-systems/hikes-harness/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/hikes-systems/hikes-harness/releases/tag/v1.0.0
