import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Paperclip,
  Plus,
  SlidersHorizontal,
  Square,
  Telescope,
  Terminal,
  X,
} from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";
import { Toggle } from "./ui";
import { useStore } from "../store";
import { useServer } from "../lib/server";
import { providerMeta, type ModelInfo } from "@shared/providers";
import { looksLikeResearch } from "@shared/research";
import { cn } from "../utils/cn";
import { pop } from "../lib/motion";

export interface Attachment { name: string; text: string; size: number }

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStop: () => void;
  running: boolean;
  models: ModelInfo[];
  modelKey: string;
  onModel: (k: string) => void;
  placement: "down" | "up";
  placeholder?: string;
  onOpenSettings: () => void;
  focusSignal?: number;
}

const TEXTY = /\.(txt|md|json|csv|ts|tsx|js|jsx|py|css|html|yml|yaml|toml|rs|go|java|c|cpp|sh|sql|log)$/i;

const TOOL_ROWS = [
  { id: "web", icon: Globe, name: "Web search" },
  { id: "code", icon: Terminal, name: "Shell & code" },
  { id: "files", icon: FileText, name: "Workspace files" },
  { id: "memory", icon: Brain, name: "Memory" },
] as const;

type ToolId = (typeof TOOL_ROWS)[number]["id"];

/** Four lines at 16px / 1.6 — the tallest the composer grows before scrolling. */
// Four 16px lines at 1.6 plus the textarea's 16px of padding. Past this the
// box scrolls, so a long paste cannot push the send button off screen.
const MAX_INPUT_HEIGHT = 120;

/**
 * Where a floating panel is pinned, in viewport pixels.
 *
 * The composer sits inside the chat column, whose stacking context is below
 * the trail log and the run deck. An absolutely positioned menu is therefore
 * painted underneath them, and any ancestor with a transform or a filter can
 * clip it. Both menus render into `document.body` instead, positioned from
 * this rect, so they always sit above the whole app.
 */
interface Anchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function ModelMenu({ models, modelKey, onModel, onClose, placement, onOpenSettings, anchor, panelRef, maxHeight }: {
  models: ModelInfo[]; modelKey: string; onModel: (k: string) => void; onClose: () => void; placement: "down" | "up"; onOpenSettings: () => void; anchor: Anchor; panelRef: RefObject<HTMLDivElement | null>; maxHeight: number;
}) {
  const [more, setMore] = useState(false);
  const featured = models.slice(0, 3);
  const rest = models.slice(3);
  const Row = ({ m }: { m: ModelInfo }) => (
    <button
      onClick={() => { onModel(m.key); onClose(); }}
      className="flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left outline-none transition-colors hover-s2 focus-visible:bg-surface2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13.5px] font-medium leading-tight t-ink">{m.name}</span>
          {m.free && (
            <span className="shrink-0 rounded border border-[var(--line)] bg-ok-soft px-1 py-px text-[9px] font-semibold uppercase tracking-[0.08em] t-ok">
              Free
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-snug t-muted">{m.desc}</span>
      </span>
      {m.key === modelKey && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 t-accent" strokeWidth={3} />}
    </button>
  );
  return createPortal(
    <motion.div
      ref={panelRef}
      variants={pop}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{
        position: "fixed",
        right: anchor.right,
        maxHeight,
        ...(placement === "down" ? { top: anchor.top + 10 } : { bottom: anchor.bottom + 10 }),
      }}
      className="z-[120] w-[min(340px,86vw)] overflow-hidden rounded-[14px] border border-[var(--line)] bg-surface p-1.5 shadow-[var(--shadow-lg)]"
    >
      <div className="scroll-thin overflow-y-auto" style={{ maxHeight: maxHeight - 12 }}>
        {featured.map((m) => <Row key={m.key} m={m} />)}
        {rest.length > 0 && (
          <>
            <div className="mx-2 my-1 h-px bg-[var(--line)]" />
            <button
              onClick={() => setMore((v) => !v)}
              className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[12.5px] t-muted outline-none transition-colors hover-s2 hover-ink"
            >
              More models
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", more && "rotate-90")} />
            </button>
            {more && (
              <div className="a-fade">
                {rest.map((m, i) => (
                  <div key={m.key}>
                    {(i === 0 || rest[i - 1].provider !== m.provider) && (
                      <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[10.5px] t-faint">
                        <ProviderLogo id={m.provider} className="h-3 w-3" />
                        {providerMeta(m.provider).name}
                      </div>
                    )}
                    <Row m={m} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mx-2 my-1 h-px bg-[var(--line)]" />
        <button
          onClick={() => { onClose(); onOpenSettings(); }}
          className="flex w-full items-center rounded-[8px] px-2.5 py-2 text-left text-[12.5px] t-muted outline-none transition-colors hover-s2 hover-ink"
        >
          Add or manage providers…
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}

function ToolsMenu({
  anchor,
  placement,
  maxHeight,
  panelRef,
  enabled,
  onToggle,
}: {
  anchor: Anchor;
  placement: "down" | "up";
  maxHeight: number;
  panelRef: RefObject<HTMLDivElement | null>;
  enabled: Record<ToolId, boolean>;
  onToggle: (id: ToolId, value: boolean) => void;
}) {
  return createPortal(
    <motion.div
      ref={panelRef}
      variants={pop}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{
        position: "fixed",
        left: anchor.left,
        maxHeight,
        overflowY: "auto",
        ...(placement === "down" ? { top: anchor.top + 10 } : { bottom: anchor.bottom + 10 }),
      }}
      className="z-[120] w-[min(300px,86vw)] overflow-hidden rounded-[14px] border border-[var(--line)] bg-surface p-1.5 shadow-[var(--shadow-lg)]"
    >
      <div className="px-2.5 pb-1.5 pt-1 text-[10.5px] t-faint">
        Tools for this message
      </div>
      {TOOL_ROWS.map((tool) => (
        <div key={tool.id} className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2">
          <tool.icon className="h-4 w-4 t-muted" />
          <span className="flex-1 text-[13px] t-ink2">{tool.name}</span>
          <Toggle
            on={enabled[tool.id]}
            onChange={(value) => onToggle(tool.id, value)}
            label={tool.name}
          />
        </div>
      ))}
    </motion.div>,
    document.body,
  );
}

export function Composer(p: Props) {
  const { state, setTools, set } = useStore();
  const { saveSettings } = useServer();
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  /** The portalled menu itself, so a click inside it is not treated as outside. */
  const panelRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [tools, setToolsOpen] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const model = useMemo(() => p.models.find((m) => m.key === p.modelKey) ?? p.models[0], [p.models, p.modelKey]);

  // Grow to four lines and stop. Past that the box scrolls, so a long paste
  // cannot push the send button and the transcript off the screen.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT) + "px";
  }, [p.value]);

  useEffect(() => { ta.current?.focus(); }, [p.focusSignal]);

  // Pin the floating menus to the composer's rectangle, and keep them pinned
  // when the window changes size. Both render into document.body, so they are
  // never clipped by an ancestor or painted under the trail log.
  useLayoutEffect(() => {
    if (!menu && !tools) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({
        left: Math.max(12, r.left),
        right: Math.max(12, window.innerWidth - r.right),
        top: r.bottom,
        bottom: window.innerHeight - r.top,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [menu, tools]);

  useEffect(() => {
    if (!menu && !tools) return;
    const down = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrap.current?.contains(target) || panelRef.current?.contains(target)) return;
      setMenu(false);
      setToolsOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setToolsOpen(false); } };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [menu, tools]);

  const canSend = (p.value.trim().length > 0 || files.length > 0) && !p.running && p.models.length > 0;
  const send = () => {
    if (!canSend) return;
    p.onSend(p.value.trim(), files);
    setFiles([]);
  };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    const out: Attachment[] = [];
    for (const f of Array.from(list).slice(0, 5)) {
      let text = "";
      if (f.type.startsWith("text/") || TEXTY.test(f.name)) text = (await f.text()).slice(0, 60000);
      out.push({ name: f.name, text, size: f.size });
    }
    setFiles((prev) => [...prev, ...out].slice(0, 6));
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleTool = (id: ToolId, value: boolean) => {
    setTools({ [id]: value });
    void saveSettings({ tools: { ...state.tools, [id]: value } }).catch(() => {
      setTools({ [id]: !value });
    });
  };

  // A panel anchored near the edge of the window must scroll inside the space
  // that is actually left, or its last rows end up off-screen.
  const panelHeight = anchor
    ? Math.max(
        180,
        p.placement === "down"
          ? window.innerHeight - anchor.top - 24
          : window.innerHeight - anchor.bottom - 24,
      )
    : 420;
  const activeTools = Object.values(state.tools).filter(Boolean).length;
  const research = state.researchMode;
  const autoResearch = looksLikeResearch(p.value);

  return (
    <div ref={wrap} className="relative w-full">
      <div className="composer-shell rounded-[16px] border border-[var(--line-strong)] bg-surface transition-[border-color,box-shadow,transform] focus-within:border-[var(--accent)]">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
            {files.map((f, i) => (
              <span key={i} className="a-pop inline-flex max-w-[220px] items-center gap-1.5 border border-[var(--line)] bg-surface2 py-1 pl-2 pr-1 text-[11.5px] t-ink2">
                <Paperclip className="h-3 w-3 shrink-0 t-faint" />
                <span className="truncate">{f.name}</span>
                <button
                  onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                  className="grid h-4 w-4 place-items-center rounded-[2px] transition-colors hover-s3"
                  aria-label="Remove attachment"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          rows={1}
          value={p.value}
          placeholder={p.placeholder ?? "Message the harness…"}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            if (e.key === "Escape") p.onChange("");
          }}
          className="scroll-thin block max-h-[120px] min-h-[34px] w-full resize-none overscroll-contain bg-transparent px-4 pb-1.5 pt-4 text-[16px] leading-[1.6] t-ink outline-none"
        />
        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1.5">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach files"
            className="grid h-9 w-9 place-items-center rounded-[8px] t-muted outline-none transition-colors hover-s3 hover-ink"
          >
            <Plus className="h-[17px] w-[17px]" />
          </button>
          <button
            onClick={() => { setToolsOpen((v) => !v); setMenu(false); }}
            title="Tools"
            aria-label={`Tools, ${activeTools} enabled`}
            aria-haspopup="dialog"
            aria-expanded={tools}
            className={cn(
              "relative grid h-9 w-9 place-items-center rounded-[8px] outline-none transition-colors hover-ink",
              tools ? "bg-accent-soft t-accent" : "t-muted hover-s3",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-[var(--on-accent)]">
              {activeTools}
            </span>
          </button>
          <button
            onClick={() => set({ researchMode: !research })}
            title={research ? "Deep research is on for the next message" : "Run deep research before answering"}
            aria-pressed={research}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-[8px] border px-2 text-[11.5px] font-medium outline-none transition-colors",
              research
                ? "border-[var(--accent-line)] bg-accent-soft t-accent"
                : "border-transparent t-muted hover-s3 hover-ink",
            )}
          >
            <Telescope className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Research</span>
            {autoResearch && !research && (
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" title="This request will research first" />
            )}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => { setMenu((v) => !v); setToolsOpen(false); }}
            className="flex h-9 min-w-0 max-w-[52%] items-center gap-1 rounded-[8px] px-2 text-[11.5px] font-medium t-ink2 outline-none transition-colors hover-s2 hover-ink"
            aria-haspopup="listbox"
            aria-expanded={menu}
            title={model?.name ?? "Choose a model"}
          >
            <span className="truncate">{model?.name ?? "No model"}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 t-faint transition-transform duration-200", menu && "rotate-180")} />
          </button>
          <button
            onClick={p.running ? p.onStop : send}
            disabled={!p.running && !canSend}
            className="composer-send ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent text-[var(--on-accent)] outline-none transition-[background-color,opacity,transform,box-shadow] hover:-translate-y-px hover:bg-[var(--accent-strong)] hover:shadow-[0_7px_18px_-8px_var(--accent)] active:translate-y-0 active:scale-95 disabled:opacity-35"
            aria-label={p.running ? "Stop" : "Send"}
          >
            {p.running ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="composer-send-icon h-[17px] w-[17px]" strokeWidth={2.6} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menu && anchor && (
          <ModelMenu
            models={p.models}
            modelKey={p.modelKey}
            onModel={p.onModel}
            onClose={() => setMenu(false)}
            placement={p.placement}
            onOpenSettings={p.onOpenSettings}
            anchor={anchor}
            panelRef={panelRef}
            maxHeight={panelHeight}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tools && anchor && (
          <ToolsMenu
            anchor={anchor}
            placement={p.placement}
            maxHeight={panelHeight}
            panelRef={panelRef}
            enabled={state.tools}
            onToggle={toggleTool}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
