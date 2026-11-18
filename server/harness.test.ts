import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Hono } from "hono";

import { loopbackOnly, tokenAuth, tokenMatches } from "./auth.ts";
import { ConfigStore, defaultConfig } from "./config.ts";
import { testProvider } from "./llm/index.ts";
import { isSensitivePath, resolveInWorkspace } from "./tools/paths.ts";
import { isDestructiveCommand } from "./tools/shell.ts";
import { modelInfo } from "../shared/protocol.ts";
import { approvalPolicy } from "./agent/policy.ts";
import { looksLikeResearch } from "../shared/research.ts";
import type { ToolDefinition } from "./tools/types.ts";

test("tokenMatches accepts the exact token and rejects near misses", () => {
  assert.equal(tokenMatches("hsk_abc123", "hsk_abc123"), true);
  assert.equal(tokenMatches("hsk_abc123", "hsk_abc124"), false);
  assert.equal(tokenMatches("hsk_abc123", ""), false);
  assert.equal(tokenMatches("hsk_abc123", "hsk_abc1234"), false);
});

test("tokenAuth allows the bearer token and rejects everything else", async () => {
  const app = new Hono();
  app.use("*", tokenAuth("hsk_test"));
  app.get("/secure", (c) => c.json({ ok: true }));

  const ok = await app.request("/secure", {
    headers: { authorization: "Bearer hsk_test", host: "127.0.0.1:8787" },
  });
  assert.equal(ok.status, 200);

  const headerToken = await app.request("/secure", {
    headers: { "x-hikes-token": "hsk_test" },
  });
  assert.equal(headerToken.status, 200);

  const missing = await app.request("/secure");
  assert.equal(missing.status, 401);

  const wrong = await app.request("/secure", {
    headers: { authorization: "Bearer nope" },
  });
  assert.equal(wrong.status, 401);
});

test("tokenAuth can be disabled for local-only use", async () => {
  const app = new Hono();
  app.use("*", tokenAuth("hsk_test", true));
  app.get("/open", (c) => c.text("open"));
  const res = await app.request("/open");
  assert.equal(res.status, 200);
});

test("loopbackOnly blocks non-local hosts and origins", async () => {
  const app = new Hono();
  app.use("*", loopbackOnly());
  app.get("/", (c) => c.text("ok"));

  assert.equal((await app.request("/", { headers: { host: "127.0.0.1:8787" } })).status, 200);
  assert.equal((await app.request("/", { headers: { host: "localhost:8787" } })).status, 200);
  assert.equal((await app.request("/", { headers: { host: "evil.example" } })).status, 403);
  assert.equal(
    (await app.request("/", { headers: { host: "127.0.0.1:8787", origin: "https://evil.example" } })).status,
    403,
  );
  assert.equal((await app.request("/", { headers: { host: "127.0.0.1:8787", origin: "null" } })).status, 403);
});

test("resolveInWorkspace keeps paths inside the root", () => {
  const root = path.resolve("C:/tmp/hikes-workspace");
  assert.equal(resolveInWorkspace(root, "src/app.ts"), path.join(root, "src", "app.ts"));
  assert.equal(resolveInWorkspace(root, "./"), root);
  assert.equal(resolveInWorkspace(root, "/src/app.ts"), path.join(root, "src", "app.ts"));

  assert.throws(() => resolveInWorkspace(root, "../secrets.txt"), /outside the workspace/);
  assert.throws(() => resolveInWorkspace(root, "src/../../secrets.txt"), /outside the workspace/);
});

test("isSensitivePath flags credentials and keys", () => {
  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("config/.env.local"), true);
  assert.equal(isSensitivePath(".ssh/id_rsa"), true);
  assert.equal(isSensitivePath("certs/server.pem"), true);
  assert.equal(isSensitivePath("secrets.prod.json"), true);
  assert.equal(isSensitivePath("src/index.ts"), false);
  assert.equal(isSensitivePath("README.md"), false);
});

test("isDestructiveCommand catches the usual footguns", () => {
  for (const command of [
    "rm -rf /",
    "rm -fr ~",
    "Remove-Item -Recurse -Force .",
    "del /f /s /q C:\\stuff",
    "rd /s /q build",
    "git reset --hard HEAD",
    "git clean -fd",
    "format C:",
    "mkfs.ext4 /dev/sda1",
    "drop database prod",
    "shutdown -h now",
  ]) {
    assert.equal(isDestructiveCommand(command), true, command);
  }

  for (const command of [
    "npm test",
    "Get-ChildItem -Recurse",
    "git status",
    "git reset --soft HEAD~1",
    "python script.py",
    "echo removed",
  ]) {
    assert.equal(isDestructiveCommand(command), false, command);
  }
});

test("ConfigStore clears cached models when a provider key changes", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-key-test-"));
  try {
    const store = new ConfigStore({ dataDir, workspace: dataDir });
    store.updateProvider("openai", { enabled: true, apiKey: "sk-first" });
    store.setModels("openai", store.modelsFor("openai"));
    assert.ok(store.provider("openai").models?.length);

    store.updateProvider("openai", { apiKey: "sk-rotated" });
    assert.equal(store.provider("openai").models, undefined);
    assert.equal(store.provider("openai").apiKey, "sk-rotated");

    store.setModels("openai", store.modelsFor("openai"));
    assert.ok(store.provider("openai").models?.length);
    store.updateProvider("openai", { clearKey: true });
    assert.equal(store.provider("openai").apiKey, "");
    assert.equal(store.provider("openai").models, undefined);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("testProvider rejects a fake OpenRouter key even though /models is public", async () => {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/api/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "openai/gpt-4.1" }] }));
      return;
    }
    if (url === "/api/v1/key") {
      const valid = req.headers.authorization === "Bearer sk-or-valid";
      res.writeHead(valid ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(valid ? { data: { label: "test" } } : { error: { message: "Invalid key" } }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  try {
    const fake = await testProvider("openrouter", {
      enabled: true,
      apiKey: "sk-or-fake",
      baseUrl,
      customModel: "",
    });
    assert.equal(fake.ok, false);
    assert.match(fake.error ?? "", /rejected/i);

    const valid = await testProvider("openrouter", {
      enabled: true,
      apiKey: "sk-or-valid",
      baseUrl,
      customModel: "",
    });
    assert.equal(valid.ok, true);
    assert.ok(valid.models?.some((m) => m.id === "openai/gpt-4.1"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("testProvider lists free models first and keeps them under the cap", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/key") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
      return;
    }
    if (req.url === "/models") {
      const data: Array<{
        id: string;
        name?: string;
        pricing: { prompt: string; completion: string };
        architecture?: { output_modalities: string[] };
      }> = Array.from({ length: 45 }, (_, i) => ({
        id: `paid/model-${i}`,
        pricing: { prompt: "0.000001", completion: "0.000002" },
      }));
      data.push({ id: "free/one", name: "Free One", pricing: { prompt: "0", completion: "0" } });
      data.push({ id: "free/two", name: "Free Two", pricing: { prompt: "0", completion: "0" } });
      data.push({
        id: "free/audio",
        name: "Audio only",
        pricing: { prompt: "0", completion: "0" },
        architecture: { output_modalities: ["text", "audio"] },
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const result = await testProvider("openrouter", {
      enabled: true,
      apiKey: "sk-or-valid",
      baseUrl,
      customModel: "",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.models?.slice(0, 2).map((m) => m.id),
      ["free/one", "free/two"],
    );
    assert.equal(result.models?.[0]?.free, true);
    assert.equal(result.models?.[0]?.name, "Free One");
    assert.equal(result.models?.[2]?.free, undefined);
    assert.equal(result.models?.some((m) => m.id === "free/audio"), false);
    assert.equal(result.models?.length, 40);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("testProvider makes custom endpoints complete a real request", async () => {
  let sawAuth = "";
  let sawBody = "";
  const server = http.createServer((req, res) => {
    if (req.url === "/v1/chat/completions") {
      sawAuth = String(req.headers.authorization ?? "");
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        sawBody = body;
        if (sawAuth !== "Bearer sk-local-valid") {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Bad key" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "pong" } }] }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  try {
    const state = {
      enabled: true,
      apiKey: "",
      baseUrl,
      customModel: "local-model",
    };

    assert.equal((await testProvider("custom", state)).ok, false);

    const good = await testProvider("custom", { ...state, apiKey: "sk-local-valid" });
    assert.equal(good.ok, true);
    assert.equal(good.models?.[0]?.id, "local-model");
    assert.equal(JSON.parse(sawBody).model, "local-model");

    const noModel = await testProvider("custom", { ...state, customModel: "" });
    assert.equal(noModel.ok, false);
    assert.match(noModel.error ?? "", /model name/i);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ConfigStore returns free models first and marks legacy :free ids", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-free-test-"));
  try {
    const store = new ConfigStore({ dataDir, workspace: dataDir });
    const paid = modelInfo("openrouter", "paid/model", "Paid model", "Available on your account");
    const free = modelInfo("openrouter", "free/model:free", "Free model", "Available on your account");
    const other = modelInfo("openrouter", "openrouter/free", "Auto free", "Available on your account");
    store.setModels("openrouter", [paid, free, other]);

    const ordered = store.modelsFor("openrouter");
    assert.deepEqual(
      ordered.map((m) => m.id),
      ["free/model:free", "openrouter/free", "paid/model"],
    );
    assert.equal(ordered[0].free, true);
    assert.equal(ordered[0].desc, "Free to use");
    assert.equal(ordered[2].free, undefined);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("defaultConfig starts with every provider disabled and balanced autonomy", () => {
  const config = defaultConfig();
  assert.equal(config.autonomy, "balanced");
  assert.deepEqual(config.tools, { web: true, code: true, files: true, memory: true });
  for (const provider of Object.values(config.providers)) {
    assert.equal(provider.enabled, false);
  }
});

test("ConfigStore ignores provider and search environment variables", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-env-test-"));
  const names = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "TAVILY_API_KEY", "BRAVE_API_KEY"];
  const saved = names.map((name) => process.env[name]);
  try {
    process.env.OPENAI_API_KEY = "sk-from-env";
    process.env.ANTHROPIC_API_KEY = "sk-ant-from-env";
    process.env.TAVILY_API_KEY = "tvly-from-env";
    process.env.BRAVE_API_KEY = "brave-from-env";

    const store = new ConfigStore({ dataDir, workspace: dataDir });
    assert.equal(store.provider("openai").apiKey, "");
    assert.equal(store.provider("openai").enabled, false);
    assert.equal(store.provider("anthropic").apiKey, "");
    assert.equal(store.providerReady("openai"), false);
    assert.equal(store.config.search.tavilyKey, "");
    assert.equal(store.config.search.braveKey, "");
  } finally {
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    });
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("ConfigStore persists the UI-managed workspace, tools and autonomy", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-settings-test-"));
  const first = path.join(dataDir, "first");
  const second = path.join(dataDir, "second");
  try {
    fs.mkdirSync(first);
    fs.mkdirSync(second);

    const store = new ConfigStore({ dataDir, workspace: first });
    assert.equal(store.workspace, first);

    store.setTools({ web: false, code: true, files: false, memory: true });
    store.setAutonomy("ask");
    store.setWorkspace(second);
    assert.equal(store.workspace, second);
    assert.throws(() => store.setWorkspace(path.join(dataDir, "missing")), /does not exist/);

    const reopened = new ConfigStore({ dataDir });
    assert.equal(reopened.workspace, second);
    assert.deepEqual(reopened.config.tools, { web: false, code: true, files: false, memory: true });
    assert.equal(reopened.config.autonomy, "ask");

    // An explicit launch folder wins over the stored one.
    const explicit = new ConfigStore({ dataDir, workspace: first });
    assert.equal(explicit.workspace, first);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("ConfigStore persists provider settings and computes ready models", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hikes-config-test-"));
  try {
    const store = new ConfigStore({ dataDir, workspace: dataDir });

    store.updateProvider("openai", { enabled: true });
    assert.equal(store.providerReady("openai"), false);
    assert.equal(store.availableModels().length, 0);

    store.updateProvider("openai", { apiKey: "sk-test" });
    assert.equal(store.providerReady("openai"), true);
    assert.ok(store.availableModels().some((m) => m.key.startsWith("openai:")));

    store.updateProvider("custom", {
      enabled: true,
      baseUrl: "http://127.0.0.1:1234/v1",
      customModel: "fake-model",
    });
    assert.equal(store.providerReady("custom"), true);
    const custom = store.modelsFor("custom");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].key, "custom:fake-model");

    store.setDefaultModel("custom:fake-model");
    assert.equal(store.resolvedDefaultModel(), "custom:fake-model");

    // A new store over the same data directory must see the same settings.
    const reopened = new ConfigStore({ dataDir, workspace: dataDir });
    assert.equal(reopened.provider("custom").customModel, "fake-model");
    assert.equal(reopened.provider("openai").apiKey, "sk-test");
    assert.equal(reopened.resolvedDefaultModel(), "custom:fake-model");

    // Changing the base URL invalidates cached model lists.
    reopened.updateProvider("custom", { baseUrl: "http://127.0.0.1:9999/v1" });
    assert.equal(reopened.provider("custom").models, undefined);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("research intent is detected before answering", () => {
  assert.equal(looksLikeResearch("Research the latest battery chemistry"), true);
  assert.equal(looksLikeResearch("compare Postgres and SQLite for this workload"), true);
  assert.equal(looksLikeResearch("Please investigate why the build is slow"), true);
  assert.equal(looksLikeResearch("give me the pros and cons of monorepos"), true);
  assert.equal(looksLikeResearch("hi"), false);
  assert.equal(looksLikeResearch("write a mountain haiku"), false);
  assert.equal(looksLikeResearch("refactor this function"), false);
});

test("approval policy follows autonomy without letting destructive commands slip", () => {
  const tool = (risk: ToolDefinition["risk"]): ToolDefinition => ({
    risk,
    spec: { name: "demo", description: "demo", parameters: { type: "object" } },
    run: async () => ({ ok: true, summary: "ok" }),
  });
  const read = tool("safe");
  const write = tool("write");
  const execute = tool("execute");

  assert.equal(approvalPolicy("ask", read, {}), true);
  assert.equal(approvalPolicy("ask", read, { command: "ls" }), true);

  assert.equal(approvalPolicy("balanced", read, {}), false);
  assert.equal(approvalPolicy("balanced", write, {}), true);
  assert.equal(approvalPolicy("balanced", execute, { command: "npm test" }), true);

  assert.equal(approvalPolicy("auto", read, {}), false);
  assert.equal(approvalPolicy("auto", write, {}), false);
  assert.equal(approvalPolicy("auto", execute, { command: "npm test" }), false);
  assert.equal(approvalPolicy("auto", execute, { command: "rm -rf /" }), true);
  assert.equal(approvalPolicy("auto", execute, { command: "format C:" }), true);
});
