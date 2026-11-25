import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import type { Source } from "../../shared/protocol.ts";
import type { SearchConfig } from "../config.ts";
import type { ToolDefinition, ToolResult } from "./types.ts";
import { ToolError } from "./types.ts";

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

const searchSchema = z.object({
  query: z.string().min(1).max(300),
  max_results: z.number().int().min(1).max(8).optional(),
});

const fetchSchema = z.object({
  url: z.string().url().max(2000),
});

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  middot: "·",
  bull: "•",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function ipIsPrivate(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(ip)) return ipv4IsPrivate(ip);
  if (!net.isIPv6(ip)) return false;
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ToolError("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolError("Only http and https URLs are allowed.");
  }
  if (url.username || url.password) throw new ToolError("URLs with credentials are not allowed.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (![80, 443, 8080, 8443].includes(port)) {
    throw new ToolError(`Port ${port} is not allowed for web fetches.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    throw new ToolError("Local and private hosts are blocked.");
  }
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new ToolError("Private IP addresses are blocked.");
    return url;
  }
  let addresses: Array<{ address: string }> = [];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ToolError(`Could not resolve ${host}.`);
  }
  if (!addresses.length || addresses.some((entry) => ipIsPrivate(entry.address))) {
    throw new ToolError("That host resolves to a private address and is blocked.");
  }
  return url;
}

/**
 * The caller's cancellation and a hard ceiling, so a site that accepts the
 * connection and then says nothing cannot hold a run open forever.
 */
function withCeiling(signal: AbortSignal, ms: number): AbortSignal {
  const ceiling = AbortSignal.timeout(ms);
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, ceiling]) : signal;
}

async function fetchPublic(raw: string, signal: AbortSignal): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: withCeiling(signal, 20_000),
      headers: {
        "user-agent": "HikesHarness/1.0 (local agent; +https://localhost)",
        accept: "text/html,application/xhtml+xml,text/plain,application/json,application/xml;q=0.9,*/*;q=0.5",
      },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new ToolError(`Redirect ${res.status} without a location.`);
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new ToolError(`The page replied ${res.status} ${res.statusText}.`);
    return res;
  }
  throw new ToolError("Too many redirects.");
}

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (total > maxBytes) {
      truncated = true;
      text = text.slice(0, maxBytes);
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
  }
  text += decoder.decode();
  return { text, truncated };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function unwrapDuckDuckGo(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}

async function duckDuckGo(query: string, limit: number, signal: AbortSignal): Promise<SearchHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetchPublic(url, signal);
  const { text: html } = await readCapped(res, 600_000);
  const hits: SearchHit[] = [];
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = snippetRe.exec(html))) snippets.push(stripTags(match[1]));
  let index = 0;
  while ((match = linkRe.exec(html)) && hits.length < limit) {
    const title = stripTags(match[2]);
    const href = unwrapDuckDuckGo(decodeEntities(match[1]));
    if (!title || !/^https?:\/\//i.test(href)) continue;
    hits.push({ title, url: href, snippet: snippets[index] ?? "" });
    index++;
  }
  if (!hits.length) {
    throw new ToolError("DuckDuckGo returned no results (it may be rate-limiting). Add a Tavily or Brave key in Settings for reliable search.");
  }
  return hits;
}

async function tavilySearch(query: string, limit: number, key: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: "basic", include_answer: false }),
    signal: withCeiling(signal, 15_000),
  });
  if (!res.ok) throw new Error(`Tavily replied ${res.status}.`);
  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (json.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? hostOf(r.url!), url: r.url!, snippet: r.content ?? "" }));
}

async function braveSearch(query: string, limit: number, key: string, signal: AbortSignal): Promise<SearchHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const res = await fetch(url, {
    headers: { accept: "application/json", "x-subscription-token": key },
    signal: withCeiling(signal, 15_000),
  });
  if (!res.ok) throw new Error(`Brave replied ${res.status}.`);
  const json = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (json.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? hostOf(r.url!), url: r.url!, snippet: r.description ?? "" }));
}

function toSources(hits: SearchHit[]): Source[] {
  return hits.map((hit) => ({ title: hit.title, host: hostOf(hit.url), url: hit.url }));
}

export function webTools(search: SearchConfig): ToolDefinition[] {
  return [
    {
      risk: "safe",
      spec: {
        name: "web_search",
        description: "Search the web and return titles, URLs and snippets. Use it for current facts, docs or anything you are unsure about.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." },
            max_results: { type: "number", description: "How many results to return (1-8). Defaults to 5." },
          },
          required: ["query"],
        },
      },
      run: async (args, ctx): Promise<ToolResult> => {
        const parsed = searchSchema.safeParse(args);
        if (!parsed.success) throw new ToolError("web_search needs a query string.");
        const { query } = parsed.data;
        const limit = parsed.data.max_results ?? 5;
        let hits: SearchHit[] = [];
        let provider = "";
        const errors: string[] = [];

        if (search.tavilyKey) {
          try {
            hits = await tavilySearch(query, limit, search.tavilyKey, ctx.signal);
            provider = "Tavily";
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (!hits.length && search.braveKey) {
          try {
            hits = await braveSearch(query, limit, search.braveKey, ctx.signal);
            provider = "Brave";
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (!hits.length) {
          try {
            hits = await duckDuckGo(query, limit, ctx.signal);
            provider = "DuckDuckGo";
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ToolError(errors.length ? `${message} (${errors.join("; ")})` : message);
          }
        }

        hits = hits.slice(0, limit);
        const output = hits
          .map((hit, i) => `${i + 1}. ${hit.title}\n   ${hit.url}${hit.snippet ? `\n   ${hit.snippet}` : ""}`)
          .join("\n\n");
        return {
          ok: true,
          summary: `Found ${hits.length} results via ${provider}`,
          detail: `“${query}”`,
          output: `Search: ${query} (${provider})\n\n${output}`,
          sources: toSources(hits),
        };
      },
    },
    {
      risk: "safe",
      spec: {
        name: "fetch_url",
        description: "Fetch a public web page and return readable text. Use it to read documentation or verify a search result.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "Absolute http(s) URL." },
          },
          required: ["url"],
        },
      },
      run: async (args, ctx): Promise<ToolResult> => {
        const parsed = fetchSchema.safeParse(args);
        if (!parsed.success) throw new ToolError("fetch_url needs a valid absolute URL.");
        const res = await fetchPublic(parsed.data.url, ctx.signal);
        const type = res.headers.get("content-type") ?? "";
        const { text: body, truncated } = await readCapped(res, 500_000);
        if (type && !/^(text\/|application\/(json|xml|xhtml\+xml|javascript))/i.test(type)) {
          throw new ToolError(`Unsupported content type: ${type}. Only text pages are supported.`);
        }
        const isHtml = /html/i.test(type) || /^\s*<(?:!doctype|html)/i.test(body);
        const titleMatch = isHtml ? body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
        const title = titleMatch ? stripTags(titleMatch[1]) : hostOf(parsed.data.url);
        const text = (isHtml ? htmlToText(body) : body).slice(0, 60_000);
        const finalUrl = res.url || parsed.data.url;
        return {
          ok: true,
          summary: `Read ${hostOf(finalUrl)} · ${text.length} chars`,
          detail: finalUrl,
          output: `# ${title}\n${finalUrl}\n\n${text}${truncated ? "\n\n… truncated" : ""}`,
          sources: [{ title, host: hostOf(finalUrl), url: finalUrl }],
        };
      },
    },
  ];
}
