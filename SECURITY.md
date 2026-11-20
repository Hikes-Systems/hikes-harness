# Security Policy

Hikes is an open-source project by **Hikes Systems**, MIT licensed, and developed in the public at [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness).

Hikes is a local-first agent harness with real capabilities: it reads and writes files, runs shell commands, fetches web pages and talks to Model Context Protocol servers. That makes security a first-class concern rather than a checklist at the end.

This document explains what Hikes protects, what it deliberately does not, how to report a vulnerability, and what we ask of you as a user.

---

## Table of contents

- [Reporting a vulnerability](#reporting-a-vulnerability)
- [What to include](#what-to-include)
- [Response timeline](#response-timeline)
- [Disclosure policy](#disclosure-policy)
- [Supported versions](#supported-versions)
- [Security model](#security-model)
- [What Hikes protects](#what-hikes-protects)
- [What Hikes does not protect](#what-hikes-does-not-protect)
- [Hardening checklist](#hardening-checklist)
- [Supply chain](#supply-chain)
- [Responsible use](#responsible-use)

---

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** A public issue gives every reader of this repository a chance to exploit the flaw before it is fixed.

Report privately through **GitHub Security Advisories**:

1. Go to [github.com/hikes-systems/hikes-harness](https://github.com/hikes-systems/hikes-harness) on GitHub.
2. Open **Security** → **Advisories** → **Report a vulnerability**.
3. Describe the issue in as much detail as you can.

This channel is private between you and the maintainers until an advisory is published. It creates a tracked record, supports a private fix branch, and lets us credit you in the disclosure.

If you cannot use GitHub Security Advisories, open a regular issue that contains **only** a one-line pointer such as *"Security report available privately — please contact me"* and no technical detail. We will reply with a private channel.

**Please do not:** post details in a public issue, a pull request, a Discord channel, a social media post, or a chat with another user. Please give the maintainers a reasonable window to ship a fix first.

---

## What to include

A good report helps us reproduce and fix quickly. Useful details:

| Detail | Why it matters |
| --- | --- |
| **What you found** | The vulnerability and the impact you believe it has |
| **How to reproduce** | Exact steps, commands, configuration or request payloads |
| **Affected version** | The output of `hikes --version` and `node --version` |
| **Impact** | What an attacker gains — read a key, run a command, escape the workspace |
| **Your environment** | OS, Node version, whether `--prod` or the dev server was in use |
| **Proof of concept** | A minimal script or request sequence, if you have one |
| **Suggested fix** | Optional, but genuinely welcome |

If you found the issue through fuzzing or automated research, that is fine and welcome — just say so, and please avoid automated scanning against infrastructure you do not own.

---

## Response timeline

Hikes is maintained by a small team, so these are best-effort targets rather than contractual service levels.

| Stage | Target |
| --- | --- |
| Acknowledgement that we received the report | 3 business days |
| Initial assessment and severity rating | 7 business days |
| Fix released for **Critical** and **High** issues | 30 days |
| Fix released for **Medium** issues | 90 days |
| Fix released for **Low** issues | Next release |
| Public disclosure | 90 days after the fix, or immediately for actively exploited issues |

If a report needs more time, we will tell you why and keep you updated. We will not leave you waiting in silence.

---

## Disclosure policy

- The maintainers coordinate the fix and the disclosure with the reporter.
- The reporter is credited in the advisory and the changelog, unless they ask to remain anonymous.
- We publish a GitHub Security Advisory with a CVE where applicable, and reference it in `CHANGELOG.md`.
- We do not pursue legal action against researchers who act in good faith, stay within the scope of the project, avoid privacy violations and service degradation, and give us reasonable time to fix the issue.
- We do ask that you do not access data that is not yours, do not exfiltrate credentials, and do not degrade the service for other users.

---

## Supported versions

Hikes is at 1.0 and moving quickly. Security fixes land on the default branch and in the latest release.

| Version | Supported | Notes |
| --- | --- | --- |
| `main` | Yes | Always the first place a fix appears |
| `1.0.x` | Yes | Current release line |
| `< 1.0` | No | Pre-release, upgrade to `1.0.x` |

Before reporting, please check whether the issue is already fixed on `main`. If it is, we will close the report and point you at the commit.

---

## Security model

Hikes is a **local tool with real capabilities, not a sandbox**.

The server binds to `127.0.0.1` and requires a per-launch token. The agent can still read and write files inside the workspace and run commands with your user's privileges once you approve them. The protections below reduce accidental exposure and stop the obvious classes of attack — they do not make the agent harmless.

```
  browser  ──HTTP──►  Hono API (127.0.0.1 only)
                        │  token auth · loopback guard
                        ▼
                      agent loop ──► LLM provider (outbound HTTPS)
                        │
                        ├─► file tools  (jailed to the workspace)
                        ├─► shell       (your user, scrubbed environment)
                        ├─► web tools   (SSRF-guarded fetches)
                        └─► MCP servers (local processes you configured)
```

---

## What Hikes protects

### Network exposure

- **Loopback-only binding.** The API and the web server bind to `127.0.0.1`, never to `0.0.0.0`. Nothing is reachable from the network.
- **Host header validation.** Requests whose `Host` header is not a loopback name (`127.0.0.1`, `localhost`, `::1`) are rejected with `403`. This blocks DNS-rebinding attacks, where a page you visit in the same browser resolves its own hostname to `127.0.0.1` and then talks to the local API as if it were local.
- **Origin validation.** A non-loopback `Origin` header is rejected. A `null` origin — sent by sandboxed iframes and some privacy modes — is rejected too.
- **Strict referrer policy.** The interface declares `Referrer-Policy: no-referrer`, so the launch token in the URL is never included in a `Referer` header, even if a future version loads an external resource.

### Authentication

- **A fresh token per launch.** Every start mints a random `hsk_…` token (24 bytes of `crypto.randomBytes`, base64url encoded).
- **Constant-time comparison.** The token is compared by hashing both sides with SHA-256 and using `timingSafeEqual`, so the comparison does not leak the token byte by byte.
- **Three accepted carriers.** `Authorization: Bearer …`, `x-hikes-token: …`, and `?token=…`. The browser uses the bearer header.
- **Token hygiene.** The UI reads the token from the URL, stores it in `localStorage` and strips it from the address bar, so it is not left in the visible URL or in the history entry.

### Secrets

- **Keys never reach the browser.** Provider and search keys are stored server-side and exposed to the UI only as a boolean (`hasKey`). The API never serialises a key into a response.
- **Restricted file mode.** `~/.hikes/config.json` is written with mode `0600` on POSIX systems. The permissions are also re-applied after every write.
- **Atomic writes.** Settings are written to a temporary file and renamed into place, so an interrupted write cannot leave a truncated or corrupt configuration.
- **Scrubbed child environments.** Shell commands inherit an environment with provider keys removed, so a command the agent runs cannot read them out of its own environment.

### The workspace

- **Path jail.** Every file tool path is resolved against the workspace root and rejected if it escapes. Leading slashes are stripped rather than treated as absolute.
- **Symlink resolution.** Paths are resolved through `fs.realpathSync` and checked again, so a symlink inside the workspace cannot be used to read outside it.
- **Secret-file refusal.** File tools refuse `.env` and `.env.*`, `.npmrc`, `.git-credentials`, `id_rsa`, `id_ed25519`, `id_ecdsa`, `credentials`, `secrets.*`, and anything with a `.pem`, `.key`, `.p12`, `.pfx` or `.keystore` extension, or inside `.ssh`, `.aws` or `.gnupg`.

### The web

- **SSRF guard.** `fetch_url` refuses non-HTTP schemes and resolves the hostname before connecting, blocking loopback, link-local and private ranges. The agent cannot use it to probe services on your machine or your internal network.

### Actions

- **Server-side approval policy.** Autonomy is enforced on the server, not in the browser. The UI cannot grant itself more permission.
- **Risk tiers.** Every tool declares `safe`, `write` or `execute`. Only `safe` tools run unattended in Balanced mode.
- **Destructive-command carve-out.** Patterns that destroy data — disk formatting, `rm -rf` on a root, `diskpart`, `git reset --hard`, `drop database` and similar — require approval even in Autonomous mode.
- **MCP tools are `execute` risk.** Tools from Model Context Protocol servers always ask for approval in Ask first and Balanced modes.
- **Reversible writes.** File writes are snapshotted before they happen, so a step can be reverted — with conflict detection, so a hand edit is never silently overwritten.

---

## What Hikes does not protect

Please read this section before pointing Hikes at anything you care about.

- **Shell commands run as you.** The workspace sets the working directory only. An approved command can reach any path your user can reach. The protections are approval prompts and the destructive-pattern block — not an operating-system sandbox.
- **Local storage is not encrypted.** Provider keys sit in plain text in `~/.hikes/config.json`, protected only by file permissions. On a shared machine, use a separate `--data-dir` or a dedicated user account.
- **Prompt injection is not solved.** A web page, a repository file or an MCP tool response can contain text aimed at the agent. Hikes limits the blast radius with approvals and the workspace jail, but it does not claim to defeat injection. Do not point the agent at untrusted material and grant it Autonomous mode.
- **MCP servers are not sandboxed.** An MCP server is a local process you chose to run. It has the same privileges as the harness itself. Only connect servers you trust.
- **Model providers see your prompts.** Conversation content is sent to whichever provider you configured. That is the point of the product, but it means your prompts leave your machine. Use a local provider such as Ollama if that matters.
- **`--no-auth` removes authentication.** The flag exists for scripted and headless use. Do not use it on a shared machine.
- **The browser is a trusted client.** The UI runs with full access to the local API once it holds the token. Anything that can execute JavaScript in that origin — including a malicious browser extension with page access — can use it.
- **No multi-user support.** There is one user, one workspace and one token. This is not designed to be exposed to a network.

### Known limitations

| Limitation | Detail | Mitigation |
| --- | --- | --- |
| **External font request** | The interface loads Geist and Geist Mono from `fonts.googleapis.com` and `fonts.gstatic.com`. This sends your IP address and the fact that you are running Hikes to a third party, and the interface depends on network access for correct typography. | A `Referrer-Policy: no-referrer` header means the launch token is never included in those requests. Self-hosting the fonts is planned. |
| **Query-string token** | The launch token is passed as `?hikes_token=…` so the UI can pick it up without a custom protocol handler. It is visible in the initial URL and may appear in local browser history or in the dev server's own access log. | The UI strips it from the address bar immediately after reading it. Pass `--token` if you want a known value, and use `--no-open` when scripting. |
| **Unencrypted SQLite database** | `~/.hikes/hikes.db` stores transcripts and memories in plain text. | File permissions only. Use a dedicated data directory for sensitive work. |

---

## Hardening checklist

For a machine that handles sensitive material:

1. **Use a dedicated OS account** for Hikes, separate from your everyday user.
2. **Use a dedicated data directory** so the database and keys are not mixed with anything else:
   ```bash
   hikes --data-dir ~/.hikes-secure
   ```
   ```bash
   chmod 700 ~/.hikes-secure
   chmod 600 ~/.hikes-secure/config.json
   ```
3. **Keep Balanced autonomy.** Do not use Autonomous mode against a workspace with sensitive files.
4. **Review every approval.** The approval card shows the exact command. Read it.
5. **Point the agent at a narrow workspace.** The workspace is the jail — the smaller it is, the smaller the blast radius.
6. **Use a local provider** if the content must not leave the machine.
7. **Do not use `--no-auth`** outside a throwaway environment.
8. **Only connect MCP servers you trust.** They are unsandboxed local processes.
9. **Keep Node current.** `node:sqlite` and the HTTP stack both receive upstream security fixes.
10. **Review the workspace for secrets** before pointing the agent at a repository.

---

## Supply chain

Hikes depends on a small set of well-known packages — Hono, React, Vite, Tailwind, Framer Motion, Lucide, Zod — plus the Node.js runtime and the `node:sqlite` module built into it.

- Dependencies are pinned through `package-lock.json`. Please commit the lockfile with any dependency change.
- `npm audit` is expected to run clean. Report any dependency advisory you find.
- The production build is a single self-contained HTML file, with no runtime asset fetches beyond the font stylesheet noted above.
- The MCP client launches whatever command you configure. Review MCP server commands before adding them, and prefer servers you have read the source of.

If you are reviewing the supply chain, the interesting files are `package.json`, `package-lock.json` and `server/mcp/client.ts`.

---

## Responsible use

Hikes is built for work you are authorised to do. A few expectations:

- Only point the agent at workspaces, files and repositories you own or have permission to use.
- Respect the terms of service of the model providers you connect.
- Respect robots.txt and the terms of the sites your agent fetches.
- Do not use Hikes to attack, scan or gain unauthorised access to systems.
- Be a good citizen of shared infrastructure — search APIs and local models both have limits.

---

## Acknowledgements

Thank you to the researchers and users who report issues responsibly. Security reports are one of the highest-value contributions a project like this can receive, and we are grateful for the time and care they take.

If your report leads to a fix, you will be credited in the advisory and in `CHANGELOG.md` unless you prefer otherwise.
