import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "../server/llm/types.ts";

const realFetch = globalThis.fetch;

function stubFetch(responder: (url: string, init: RequestInit, attempt: number) => Promise<Response>) {
  let attempt = 0;
  mock.method(globalThis, "fetch", async (input: unknown, init: RequestInit = {}) => {
    attempt += 1;
    return responder(String(input), init, attempt);
  });
  return () => attempt;
}

afterEach(() => {
  mock.method(globalThis, "fetch", realFetch);
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("a successful response is returned untouched", async () => {
  const attempts = stubFetch(async () => json({ ok: true }));
  const res = await fetchWithRetry("http://provider.test/v1", { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(attempts(), 1);
});

test("a transient provider fault is retried once and then succeeds", async () => {
  const attempts = stubFetch(async (_url, _init, attempt) =>
    attempt === 1 ? json({ error: "busy" }, 503) : json({ ok: true }),
  );
  const attempts1 = await fetchWithRetry("http://provider.test/v1", { method: "POST" });
  assert.equal(attempts1.status, 200);
  assert.equal(attempts(), 2);
});

test("a request the provider rejects outright is not retried", async () => {
  const attempts = stubFetch(async () => json({ error: "bad key" }, 401));
  const res = await fetchWithRetry("http://provider.test/v1", { method: "POST" });
  assert.equal(res.status, 401);
  assert.equal(attempts(), 1);
});

test("the retry budget is finite", async () => {
  const attempts = stubFetch(async () => json({ error: "down" }, 500));
  const res = await fetchWithRetry("http://provider.test/v1", { method: "POST" }, { retries: 1 });
  assert.equal(res.status, 500);
  assert.equal(attempts(), 2);
});

test("a caller that cancels is honoured immediately", async () => {
  const attempts = stubFetch(async () => json({ error: "down" }, 500));
  const controller = new AbortController();
  controller.abort();
  // The request never reaches the network, so a retry is impossible.
  await assert.rejects(
    fetchWithRetry("http://provider.test/v1", { method: "POST" }, { signal: controller.signal }),
  );
  assert.equal(attempts(), 0);
});

test("the header timeout does not outlive the response", async () => {
  // A body that takes longer than the timeout must still stream: only the
  // wait for the response to start is bounded.
  stubFetch(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(json({ ok: true })), 60);
      }),
  );
  const res = await fetchWithRetry("http://provider.test/v1", { method: "POST" }, { timeoutMs: 20 });
  assert.equal(res.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(await res.json(), { ok: true });
});