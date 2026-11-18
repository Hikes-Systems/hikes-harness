import type { ModelInfo, ProviderId } from "./providers.ts";
import type { SubAgentType } from "./agents.ts";

export type {
  ModelInfo,
  ProviderId,
  ProviderKind,
  ProviderMeta,
} from "./providers.ts";
export type { SubAgentType } from "./agents.ts";
export {
  CATALOG,
  PROVIDERS,
  PROVIDER_IDS,
  isProviderId,
  modelInfo,
  providerMeta,
} from "./providers.ts";

export type Tone = "concise" | "balanced" | "thorough";
export type Autonomy = "ask" | "balanced" | "auto";

export interface RunProfile {
  name: string;
  role: string;
  goals: string[];
  tone: Tone;
}

export interface ToolFlags {
  web: boolean;
  code: boolean;
  files: boolean;
  memory: boolean;
}

export interface Source {
  title: string;
  host: string;
  url?: string;
}

export type StepKind = "think" | "search" | "file" | "code" | "memory" | "write" | "research" | "agent";
export type StepState = "running" | "done";
export type ToolRisk = "safe" | "write" | "execute";
export type ToolStatus = "pending" | "approved" | "denied" | "done" | "error";
export type RunMode = "chat" | "research";

export interface ToolStep {
  name: string;
  args: unknown;
  risk: ToolRisk;
  status: ToolStatus;
  output?: string;
  ok?: boolean;
}

export interface Step {
  id: string;
  kind: StepKind;
  label: string;
  detail?: string;
  summary?: string;
  state: StepState;
  ms?: number;
  sources?: Source[];
  tool?: ToolStep;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimated?: boolean;
}

export interface ApprovalRequest {
  callId: string;
  name: string;
  args: unknown;
  risk: ToolRisk;
  description: string;
}

export type MsgStatus = "running" | "done" | "error" | "stopped";

export type SubAgentStatus = "running" | "done" | "error";

export interface SubAgentResult {
  summary: string;
  artifacts: { path: string; description: string }[];
  sources: Source[];
  toolCalls: number;
}

export interface SubAgentTask {
  id: string;
  type: SubAgentType;
  title: string;
  instruction: string;
  context?: string;
  status: SubAgentStatus;
  steps: Step[];
  result?: SubAgentResult;
  error?: string;
  ms?: number;
}

export interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Prompt including attachment text, sent to the model. */
  full?: string;
  files?: string[];
  steps?: Step[];
  subagents?: SubAgentTask[];
  /** This answer was produced with the deep-research pre-pass. */
  research?: boolean;
  status?: MsgStatus;
  model?: string;
  provider?: ProviderId;
  ms?: number;
  error?: string;
  usage?: Usage;
  approval?: ApprovalRequest | null;
  createdAt?: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  agent: string;
  updatedAt: number;
  messageCount: number;
}

export interface Session {
  id: string;
  title: string;
  agent: string;
  messages: Msg[];
  updatedAt: number;
}

export interface ProviderView {
  enabled: boolean;
  baseUrl: string;
  customModel: string;
  hasKey: boolean;
  modelCount: number;
}

export interface Bootstrap {
  version: string;
  node: string;
  dataDir: string;
  workspace: string;
  providers: Record<ProviderId, ProviderView>;
  models: ModelInfo[];
  defaultModel?: string;
  tools: ToolFlags;
  autonomy: Autonomy;
  search: { tavily: boolean; brave: boolean };
  memoryCount: number;
  tokenRequired: boolean;
}

export interface TestProviderResult {
  ok: boolean;
  models?: ModelInfo[];
  error?: string;
}

export interface SettingsPatch {
  defaultModel?: string;
  workspace?: string;
  tools?: ToolFlags;
  autonomy?: Autonomy;
  search?: {
    tavilyKey?: string;
    braveKey?: string;
    clearTavily?: boolean;
    clearBrave?: boolean;
  };
}

export interface RunRequest {
  sessionId: string;
  text: string;
  full: string;
  files: string[];
  agentId: string;
  modelKey: string;
  tools: ToolFlags;
  autonomy: Autonomy;
  profile: RunProfile;
  /** Research runs gather evidence in a pre-pass before answering. */
  mode?: RunMode;
  /** Replace this assistant message and everything after it, then retry. */
  retryOf?: string;
}

export type RunEndStatus = "done" | "error" | "stopped";

export type RunEvent =
  | {
      type: "run.start";
      runId: string;
      sessionId: string;
      userMessage: Msg;
      assistantMessage: Msg;
    }
  | { type: "step.start"; step: Step }
  | {
      type: "step.done";
      id: string;
      ms: number;
      detail?: string;
      summary?: string;
      ok?: boolean;
      sources?: Source[];
      output?: string;
      toolStatus?: ToolStatus;
    }
  | { type: "text.delta"; delta: string }
  | { type: "tool.approval"; request: ApprovalRequest }
  | { type: "subagent.start"; task: SubAgentTask }
  | { type: "subagent.update"; task: SubAgentTask }
  | { type: "research.phase"; phase: string; label: string }
  | { type: "usage"; usage: Usage }
  | {
      type: "run.end";
      status: RunEndStatus;
      ms: number;
      message: Msg;
      error?: string;
    }
  | { type: "error"; message: string }
  | { type: "ping" };

export const uid = () => Math.random().toString(36).slice(2, 10);
