import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, ChevronDown, ChevronRight, FileText, Globe, Brain, Paperclip, Plus, SlidersHorizontal, Square, Telescope, Terminal, X } from "lucide-react";
import { Glass } from "./Glass";
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

function ModelMenu({ models, modelKey, onModel, onClose, placement, onOpenSettings }: {
  models: ModelInfo[]; modelKey: string; onModel: (k: string) => void; onClose: () => void; placement: "down" | "up"; onOpenSettings: () => void;
}) {
  const [more, setMore] = useState(false);
  const featured = models.slice(0, 3);
  const rest = models.slice(3);
  const Row = ({ m }: { m: ModelInfo }) => (
    <button
      onClick={() => { onModel(m.key); onClose(); }}
      className="flex w-full items-start gap-3 rounded-2xl px-3.5 py-2.5 text-left outline-none transition-colors hover:bg-white/12 focus-visible:bg-white/12"
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14.5px] font-medium leading-tight">{m.name}</span>
          {m.free && (
            <span className="shrink-0 rounded-full bg-emerald-300/15 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
              Free
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-white/60">{m.desc}</span>
      </span>
      {m.key === modelKey && <Check className="mt-0.5 h-4 w-4 shrink-0 accent-text" strokeWidth={3} />}
    </button>
  );
  return (
    <motion.div
      variants={pop}
      initial="hidden"
      animate="show"
      exit="exit"
      className={cn("absolute right-0 z-50 w-[min(340px,86vw)]", placement === "down" ? "top-full mt-3" : "bottom-full mb-3")}
    >
      <Glass radius={26} strength="md" blur={0.3} backdropBlur={22} solid="rgba(20,12,60,.92)" animate contentClassName="p-1.5" tint="linear-gradient(160deg, rgba(58,38,128,.9), rgba(16,9,50,.94))">
        <div className="scroll-thin max-h-[52vh] overflow-y-auto">
          {featured.map((m) => <Row key={m.key} m={m} />)}
          {rest.length > 0 && (
            <>
              <div className="mx-3 my-1 h-px bg-white/15" />
              <button onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-[14px] outline-none transition-colors hover:bg-white/12">
                More models <ChevronRight className={cn("h-4 w-4 text-white/60 transition-transform duration-300", more && "rotate-90")} />
              </button>
              {more && (
                <div className="a-fade">
                  {rest.map((m, i) => (
                    <div key={m.key}>
                      {(i === 0 || rest[i - 1].provider !== m.provider) && (
                        <div className="px-3.5 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/40">{providerMeta(m.provider).name}</div>
                      )}
                      <Row m={m} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="mx-3 my-1 h-px bg-white/15" />
          <button onClick={() => { onClose(); onOpenSettings(); }} className="flex w-full items-center rounded-2xl px-3.5 py-2.5 text-left text-[13px] text-white/70 outline-none transition-colors hover:bg-white/12 hover:text-white">
            Add or manage providers…
          </button>
        </div>
      </Glass>
    </motion.div>
  );
}

export function Composer(p: Props) {
  const { state, setTools, set } = useStore();
  const { saveSettings } = useServer();
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [tools, setToolsOpen] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);

  const model = useMemo(() => p.models.find((m) => m.key === p.modelKey) ?? p.models[0], [p.models, p.modelKey]);
  const [first, ...restName] = (model?.name ?? "No model").split(" ");

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 190) + "px";
  }, [p.value]);

  useEffect(() => { ta.current?.focus(); }, [p.focusSignal]);

  useEffect(() => {
    if (!menu && !tools) return;
    const down = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) { setMenu(false); setToolsOpen(false); }
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

  const placementClass = p.placement === "down" ? "top-full mt-3" : "bottom-full mb-3";
  const TOOL_ROWS = [
    { id: "web", icon: Globe, name: "Web search" }, { id: "code", icon: Terminal, name: "Shell & code" },
    { id: "files", icon: FileText, name: "Workspace files" }, { id: "memory", icon: Brain, name: "Memory" },
  ] as const;
  const activeTools = Object.values(state.tools).filter(Boolean).length;
  const research = state.researchMode;
  const autoResearch = looksLikeResearch(p.value);

  return (
    <div ref={wrap} className="relative w-full">
      <Glass radius={30} strength="md" animate contentClassName="px-4 pb-3 pt-4 sm:px-5">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span key={i} className="a-pop glass-css inline-flex max-w-[220px] items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1.5 text-[12.5px]">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-white/70" />
                <span className="truncate">{f.name}</span>
                <button onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20" aria-label="Remove"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ta} rows={1} value={p.value} placeholder={p.placeholder ?? "How can I help you today?"}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            if (e.key === "Escape") p.onChange("");
          }}
          className="block max-h-[190px] min-h-[30px] w-full resize-none bg-transparent px-1 text-[16.5px] leading-[1.55] text-white outline-none placeholder:text-white/65"
        />
        <div className="mt-3 flex items-center gap-1.5">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} title="Attach files" className="glass-css glass-hover grid h-9 w-9 place-items-center rounded-full outline-none"><Plus className="h-[18px] w-[18px]" /></button>
          <button onClick={() => { setToolsOpen((v) => !v); setMenu(false); }} title="Tools" className={cn("glass-hover relative grid h-9 w-9 place-items-center rounded-full outline-none", tools ? "sel-on" : "glass-css")}>
            <SlidersHorizontal className="h-[17px] w-[17px]" />
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-[#1b1038]" style={{ background: "var(--accent)" }}>{activeTools}</span>
          </button>
          <button
            onClick={() => set({ researchMode: !research })}
            title={research ? "Deep research is on for the next message" : "Run deep research before answering"}
            aria-pressed={research}
            className={cn(
              "glass-hover flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium outline-none",
              research ? "sel-on text-white" : "glass-css text-white/70 hover:text-white",
            )}
          >
            <Telescope className="h-4 w-4" />
            <span className="hidden sm:inline">Research</span>
            {autoResearch && !research && (
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" title="This request will research first" />
            )}
          </button>
          <div className="flex-1" />
          <button onClick={() => { setMenu((v) => !v); setToolsOpen(false); }} className="flex h-9 items-center gap-1 rounded-full px-3 font-serif text-[17px] outline-none transition-colors hover:bg-white/12" aria-haspopup="listbox" aria-expanded={menu}>
            <span className="font-semibold">{first}</span>
            <span className="text-white/80">{restName.join(" ")}</span>
            <ChevronDown className={cn("ml-0.5 h-4 w-4 text-white/60 transition-transform duration-300", menu && "rotate-180")} />
          </button>
          <button
            onClick={p.running ? p.onStop : send} disabled={!p.running && !canSend}
            className={cn("btn-primary glass-hover grid h-10 w-10 place-items-center rounded-full outline-none transition-opacity", !p.running && !canSend && "opacity-40")}
            aria-label={p.running ? "Stop" : "Send"}
          >
            {p.running ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-[19px] w-[19px]" strokeWidth={2.6} />}
          </button>
        </div>
      </Glass>

      <AnimatePresence>
        {menu && <ModelMenu models={p.models} modelKey={p.modelKey} onModel={p.onModel} onClose={() => setMenu(false)} placement={p.placement} onOpenSettings={p.onOpenSettings} />}
      </AnimatePresence>

      <AnimatePresence>
        {tools && (
          <motion.div
            variants={pop}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn("glass-css absolute left-0 z-50 w-[min(300px,86vw)] rounded-3xl p-2", placementClass)}
          >
            {TOOL_ROWS.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                <t.icon className="h-[18px] w-[18px] text-white/80" />
                <span className="flex-1 text-[14px]">{t.name}</span>
                <Toggle
                  on={state.tools[t.id]}
                  onChange={(v) => {
                    setTools({ [t.id]: v });
                    void saveSettings({ tools: { ...state.tools, [t.id]: v } }).catch(() => {
                      setTools({ [t.id]: !v });
                    });
                  }}
                  label={t.name}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
