import type {
  ModelInfo,
  RunRequest,
  RunEvent,
  Source,
  Step,
  StepKind,
} from "../../shared/protocol.ts";
import { streamModel } from "../llm/index.ts";
import type { AgentMessage } from "../llm/types.ts";
import type { ToolDefinition } from "../tools/types.ts";

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}\n… truncated` : value;

const cleanQuery = (line: string): string =>
  line
    .replace(/^[\s>*\-–—\d.)]+/, "")
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\s+/g, " ")
    .trim();

function fallbackQueries(text: string): string[] {
  const topic = text.replace(/\s+/g, " ").trim().slice(0, 140);
  return [topic, `${topic} latest`, `${topic} explained`].filter(Boolean);
}

export interface ResearchHooks {
  startStep: (kind: StepKind, label: string, detail?: string) => Step;
  finishStep: (
    step: Step,
    patch: { summary?: string; detail?: string; ok?: boolean; sources?: Source[]; output?: string },
  ) => void;
  emit: (event: RunEvent) => void;
  registry: Map<string, ToolDefinition>;
  toolContext: Parameters<ToolDefinition["run"]>[1];
}

export interface ResearchOutcome {
  brief: string;
  sources: Source[];
  queries: string[];
}

/**
 * Sequential deep-research pre-pass. It plans sub-questions, searches the web,
 * reads the best pages and synthesizes an evidence brief. Only after this
 * finishes does the main agent start writing the answer.
 */
export async function runDeepResearch(
  input: RunRequest,
  model: ModelInfo,
  provider: Parameters<typeof streamModel>[0]["provider"],
  signal: AbortSignal,
  hooks: ResearchHooks,
): Promise<ResearchOutcome> {
  const search = hooks.registry.get("web_search");
  const fetchPage = hooks.registry.get("fetch_url");
  const question = (input.full || input.text).trim();
  const empty: ResearchOutcome = { brief: "", sources: [], queries: [] };
  if (!search || !question) return empty;

  const planStep = hooks.startStep("research", "Planning the research", "Breaking the question into sub-questions");
  hooks.emit({ type: "research.phase", phase: "plan", label: "Planning the research" });

  let queries: string[] = [];
  try {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [
          "Turn this request into 3 to 4 focused web search queries.",
          "Return only the queries, one per line, with no numbering, bullets or commentary.",
          "",
          `Request: ${clip(question, 1200)}`,
        ].join("\n"),
      },
    ];
    let plannerText = "";
    for await (const event of streamModel({
      model,
      provider,
      system:
        "You are a research planner. Produce short, specific search queries that together answer the request. Never answer the request itself.",
      messages,
      tools: [],
      signal,
    })) {
      if (event.type === "text") plannerText += event.text;
    }
    queries = plannerText
      .split(/\r?\n/)
      .map(cleanQuery)
      .filter((query) => query.length >= 8 && query.length <= 180 && !query.endsWith(":"))
      .slice(0, 4);
  } catch (error) {
    if (signal.aborted) throw error;
  }
  if (!queries.length) queries = fallbackQueries(question);
  hooks.finishStep(planStep, {
    summary: `${queries.length} ${queries.length === 1 ? "query" : "queries"}`,
    output: queries.map((query, index) => `${index + 1}. ${query}`).join("\n"),
  });

  const sources: Source[] = [];
  const seen = new Set<string>();
  const evidence: string[] = [];
  const pages = new Map<string, string>();

  for (const query of queries) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    hooks.emit({ type: "research.phase", phase: "search", label: `Searching: ${query}` });
    const searchStep = hooks.startStep("search", "Searching the web", `“${query}”`);
    let links: Source[] = [];
    try {
      const result = await search.run({ query, max_results: 5 }, hooks.toolContext);
      links = result.sources ?? [];
      for (const source of links) {
        const key = source.url ?? source.title;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push(source);
      }
      hooks.finishStep(searchStep, {
        summary: result.summary,
        ok: result.ok,
        sources: links,
        output: result.output,
      });
      evidence.push(`Search: ${query}\n${result.output ?? result.summary}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      hooks.finishStep(searchStep, { summary: message.slice(0, 240), ok: false });
      if (signal.aborted) throw error;
    }

    if (!fetchPage) continue;
    const targets = links.filter((source) => source.url).slice(0, 2);
    for (const target of targets) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!target.url) continue;
      hooks.emit({ type: "research.phase", phase: "read", label: `Reading: ${target.host}` });
      const readStep = hooks.startStep("search", "Reading a source", target.url);
      try {
        const result = await fetchPage.run({ url: target.url }, hooks.toolContext);
        hooks.finishStep(readStep, {
          summary: result.summary,
          ok: result.ok,
          sources: result.sources,
          output: result.output,
        });
        if (result.output) pages.set(target.url, clip(result.output, 5000));
        evidence.push(`Source: ${target.title} — ${target.url}\n${clip(result.output ?? result.summary, 5000)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        hooks.finishStep(readStep, { summary: message.slice(0, 240), ok: false });
        if (signal.aborted) throw error;
      }
    }
  }

  hooks.emit({ type: "research.phase", phase: "synthesize", label: "Preparing the evidence brief" });
  const brief = [
    "Deep research was completed BEFORE this answer. Use the evidence below instead of searching again.",
    "Cite the source links inline in Markdown. If the evidence conflicts, say so explicitly. If something is missing, state the gap.",
    "",
    evidence.join("\n\n"),
  ]
    .join("\n")
    .slice(0, 60_000);

  return { brief, sources, queries };
}
