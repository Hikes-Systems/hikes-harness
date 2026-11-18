import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { cn } from "../utils/cn";

export function Burst({ className, spin = true }: { className?: string; spin?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("accent-text", className)} style={spin ? { animation: "spin-slow 28s linear infinite" } : undefined} aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <line key={i} x1="16" y1="3.2" x2="16" y2="12" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" transform={`rotate(${i * 45} 16 16)`} />
      ))}
    </svg>
  );
}

export function MountainMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M2 26 L11 9 L16.5 18 L20 12.5 L30 26 Z" fill="currentColor" opacity=".95" />
      <path d="M11 9 L13.6 13.8 L11 12.4 L8.7 13.6 Z" fill="#fff" opacity=".9" />
      <circle cx="24.5" cy="8" r="2.6" fill="currentColor" opacity=".7" />
    </svg>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "glass" | "ghost"; size?: "sm" | "md" | "lg" };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "glass", size = "md", className, children, ...rest }, ref,
) {
  const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2" };
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-medium outline-none transition-[transform,opacity,background-color] duration-300 focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none",
        sizes[size],
        variant === "primary" && "btn-primary glass-hover",
        variant === "glass" && "glass-css glass-hover text-white/95 hover:bg-white/10",
        variant === "ghost" && "text-white/75 hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
});

export function IconButton({ className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/85 outline-none transition-[transform,background-color] duration-300 hover:bg-white/15 active:scale-90 focus-visible:ring-2 focus-visible:ring-white/60",
        active && "bg-white/20 text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({ active, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] outline-none transition-[transform,background-color,box-shadow] duration-300 glass-hover focus-visible:ring-2 focus-visible:ring-white/60",
        active ? "sel-on text-white" : "glass-css text-white/80 hover:text-white",
        className,
      )}
    >
      {active && <Check className="h-3.5 w-3.5 accent-text" strokeWidth={3} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/60">{label}</span>
        {hint && <span className="text-[12px] text-white/45">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; secret?: boolean }>(
  function TextInput({ className, icon, secret, ...rest }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className={cn("glass-inset flex h-12 items-center gap-2 rounded-2xl px-4 transition-shadow", className)}>
        {icon && <span className="text-white/50">{icon}</span>}
        <input
          ref={ref}
          {...rest}
          type={secret && !show ? "password" : secret ? "text" : rest.type}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/35"
          autoComplete="off"
          spellCheck={false}
        />
        {secret && (
          <button type="button" onClick={() => setShow((s) => !s)} className="text-white/50 transition hover:text-white" aria-label="Toggle visibility">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    );
  },
);

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-white/60", on ? "" : "bg-white/15")}
      style={on ? { background: "linear-gradient(180deg, color-mix(in oklab, var(--accent) 60%, white), var(--accent))", boxShadow: "0 0 18px -2px color-mix(in oklab, var(--accent) 60%, transparent)" } : { boxShadow: "inset 0 1px 3px rgba(0,0,0,.35)" }}
    >
      <span
        className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-300"
        style={{ transform: `translateX(${on ? 20 : 0}px)`, transitionTimingFunction: "cubic-bezier(.3,1.4,.5,1)", boxShadow: "0 2px 6px rgba(0,0,0,.35), inset 0 -1px 2px rgba(0,0,0,.1)" }}
      />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="glass-inset relative grid rounded-full p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <div
        className="absolute bottom-1 top-1 rounded-full transition-transform duration-500"
        style={{
          width: `calc((100% - 8px) / ${options.length})`, left: 4, transform: `translateX(${idx * 100}%)`,
          transitionTimingFunction: "cubic-bezier(.3,1.25,.5,1)",
          background: "linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,.14))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.7), 0 4px 12px rgba(0,0,0,.25)",
        }}
      />
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={cn("relative z-10 h-9 rounded-full px-3 text-[13px] font-medium outline-none transition-colors", value === o.id ? "text-white" : "text-white/60 hover:text-white/90")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
