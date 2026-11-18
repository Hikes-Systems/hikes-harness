import { Fragment, memo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

const KW = /\b(const|let|var|function|return|import|from|export|default|if|else|for|while|await|async|def|class|type|interface|new|extends|useState|useEffect|true|false|null|undefined|None|True|False)\b/;

function highlight(code: string, lang: string): ReactNode[] {
  const hash = /^(py|python|sh|bash|yaml|yml)$/.test(lang);
  const re = new RegExp(`(${hash ? "#.*" : "\\/\\/.*"}|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`|${KW.source}|\\b\\d+(?:\\.\\d+)?\\b)`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const t = m[0];
    const cls = /^(#|\/\/)/.test(t) ? "text-white/40 italic" : /^["'`]/.test(t) ? "text-emerald-200" : /^\d/.test(t) ? "text-amber-200" : "accent-text";
    out.push(<span key={i++} className={cls}>{t}</span>);
    last = m.index + t.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-4 overflow-hidden rounded-2xl" style={{ background: "rgba(6,4,30,.5)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.2)" }}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11.5px] uppercase tracking-wider text-white/50">
        <span>{lang || "text"}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          className="inline-flex items-center gap-1.5 normal-case tracking-normal text-white/60 transition hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-white/90"><code>{highlight(code, lang)}</code></pre>
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("`")) return <code key={i} className="inline">{p.slice(1, -1)}</code>;
    if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    const l = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (l) return <a key={i} href={l[2]} target="_blank" rel="noreferrer">{l[1]}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function MarkdownImpl({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<CodeBlock key={k++} code={buf.join("\n")} lang={fence[1]} />);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(line);
    if (h) { blocks.push(<h3 key={k++}>{inline(h[2])}</h3>); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={k++}>{buf.map((b, j) => <Fragment key={j}>{inline(b)}{j < buf.length - 1 && <br />}</Fragment>)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      blocks.push(<ol key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(buf.join(" "))}</p>);
  }
  return <div className="md text-[15.5px] text-white/90">{blocks}</div>;
}

export const Markdown = memo(MarkdownImpl);
