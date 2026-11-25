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
    const cls = /^(#|\/\/)/.test(t) ? "tok-com" : /^["'`]/.test(t) ? "tok-str" : /^\d/.test(t) ? "tok-num" : "tok-kw";
    out.push(<span key={i++} className={cls}>{t}</span>);
    last = m.index + t.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-[4px] border border-[var(--line)] bg-[var(--code-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.1em] t-faint">
        <span>{lang || "text"}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          className="inline-flex items-center gap-1.5 normal-case tracking-normal t-muted transition-colors hover-ink"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed t-ink2"><code>{highlight(code, lang)}</code></pre>
    </div>
  );
}

/** Inline code, bold, italic, strikethrough and links. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith("`")) return <code key={i} className="inline">{p.slice(1, -1)}</code>;
    if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("~~")) return <del key={i}>{p.slice(2, -2)}</del>;
    if (p.startsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    const l = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    if (l) return <a key={i} href={l[2]} target="_blank" rel="noreferrer">{l[1]}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function Heading({ level, children }: { level: number; children: ReactNode }) {
  const Tag = (["h1", "h2", "h3", "h4", "h5", "h6"] as HeadingTag[])[Math.min(Math.max(level, 1), 6) - 1];
  return <Tag className={`md-h md-h${level}`}>{children}</Tag>;
}

/* ───────────── tables ───────────── */

const DELIMITER = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const isDelimiterRow = (line: string): boolean =>
  line.includes("|") && DELIMITER.test(line);

/** Split a table row into cells, honouring escaped pipes. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

type Align = "left" | "center" | "right";

function alignments(delimiter: string[]): Align[] {
  return delimiter.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "left";
  });
}

function Table({ head, rows, align }: { head: string[]; rows: string[][]; align: Align[] }) {
  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={i} style={{ textAlign: align[i] ?? "left" }}>{inline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} style={{ textAlign: align[c] ?? "left" }}>{inline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── lists ───────────── */

interface ListItem {
  depth: number;
  text: string;
  ordered: boolean;
  /** `null` for a normal item, otherwise whether the task is checked. */
  task: boolean | null;
}

interface TreeNode {
  item: ListItem;
  children: TreeNode[];
}

/** Turn a flat list with indentation depths into a tree. */
function buildTree(items: ListItem[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const item of items) {
    const node: TreeNode = { item, children: [] };
    while (stack.length && stack[stack.length - 1].item.depth >= item.depth) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function ListNodes({ nodes, start }: { nodes: TreeNode[]; start?: number }) {
  const ordered = nodes[0]?.item.ordered ?? false;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={ordered ? "md-ol" : "md-ul"} start={ordered ? start : undefined}>
      {nodes.map((node, i) => (
        <li key={i} className={node.item.task !== null ? "md-task" : undefined}>
          {node.item.task !== null && (
            <span className={`md-check${node.item.task ? " on" : ""}`} aria-hidden="true">
              {node.item.task && <Check className="h-2.5 w-2.5" />}
            </span>
          )}
          <span className={node.item.task ? "md-done" : undefined}>{inline(node.item.text)}</span>
          {node.children.length > 0 && <ListNodes nodes={node.children} />}
        </li>
      ))}
    </Tag>
  );
}

function MarkdownImpl({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  const isBlockStart = (line: string): boolean =>
    /^```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*([-*_])\s*(\1\s*){2,}$/.test(line) ||
    isDelimiterRow(line);

  while (i < lines.length) {
    const line = lines[i];

    /* fenced code */
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(<CodeBlock key={k++} code={buf.join("\n")} lang={fence[1]} />);
      continue;
    }

    /* horizontal rule */
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      blocks.push(<hr key={k++} className="md-hr" />);
      i++;
      continue;
    }

    /* ATX heading */
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const content = h[2].replace(/\s*#+\s*$/, "");
      blocks.push(<Heading key={k++} level={h[1].length}>{inline(content)}</Heading>);
      i++;
      continue;
    }

    /* "--- Title" / "=== Title" — not valid Markdown, but a common way models
       try to write a section divider with a title. Treat it as a heading so
       it does not land as a stray paragraph. */
    const pseudo = /^\s*(-{3,}|={3,})\s+(.+?)\s*$/.exec(line);
    if (pseudo) {
      const level = pseudo[1][0] === "=" ? 1 : 2;
      const content = pseudo[2].replace(/\s*[-=]+\s*$/, "");
      blocks.push(<Heading key={k++} level={level}>{inline(content)}</Heading>);
      i++;
      continue;
    }

    /* table: a header row followed by a delimiter row */
    if (line.includes("|") && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      const head = splitRow(line);
      const align = alignments(splitRow(lines[i + 1]));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitRow(lines[i++]));
      }
      blocks.push(<Table key={k++} head={head} rows={rows} align={align} />);
      continue;
    }

    /* blockquote */
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={k++}>
          {buf.map((b, j) => (
            <Fragment key={j}>{inline(b)}{j < buf.length - 1 && <br />}</Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    /* lists */
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items: ListItem[] = [];
      const start = Number(/^\s*(\d+)\./.exec(line)?.[1] ?? 1) || 1;
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        const box = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
        items.push({
          depth: Math.floor(m[1].length / 2),
          text: box ? box[2] : m[3],
          ordered: /^\d/.test(m[2]),
          task: box ? box[1] !== " " : null,
        });
        i++;
      }
      blocks.push(<ListNodes key={k++} nodes={buildTree(items)} start={start} />);
      continue;
    }

    /* blank */
    if (!line.trim()) {
      i++;
      continue;
    }

    /* paragraph — watch for a setext heading underline */
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStart(lines[i]) &&
      !/^\s*=+\s*$/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    const next = lines[i] ?? "";
    if (buf.length && /^\s*=+\s*$/.test(next)) {
      blocks.push(<Heading key={k++} level={1}>{inline(buf.join(" "))}</Heading>);
      i++;
      continue;
    }
    if (buf.length && /^\s*-{2,}\s*$/.test(next) && !isDelimiterRow(next)) {
      blocks.push(<Heading key={k++} level={2}>{inline(buf.join(" "))}</Heading>);
      i++;
      continue;
    }
    blocks.push(<p key={k++}>{inline(buf.join(" "))}</p>);
  }

  return <div className="md">{blocks}</div>;
}

export const Markdown = memo(MarkdownImpl);
