import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { cn } from "../utils/cn";

/* The brand mark ships as two rasters of the same artwork in assets/: a black
   one for light palettes and an inverted one for dark palettes. */
import markLight from "../../assets/hikes-mark.png";
import markDark from "../../assets/hikes-mark-dark.png";

export function MountainMark({ className }: { className?: string }) {
  return (
    <>
      <img src={markLight} alt="" aria-hidden className={cn("mark-light", className)} />
      <img src={markDark} alt="" aria-hidden className={cn("mark-dark", className)} />
    </>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "md", className, children, ...rest }, ref,
) {
  const sizes = {
    sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-[8px]",
    md: "h-9 px-3.5 text-[13px] gap-2 rounded-[8px]",
    lg: "h-10 px-4 text-[13px] gap-2 rounded-[8px]",
  };
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium outline-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:pointer-events-none",
        sizes[size],
        variant === "primary" && "btn-primary",
        variant === "secondary" && "btn-secondary",
        variant === "ghost" && "btn-ghost",
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
        "grid h-9 w-9 shrink-0 place-items-center rounded-[8px] t-muted outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover-s3 hover-ink active:translate-y-0 active:scale-[.92] focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]",
        active && "bg-accent-soft t-accent shadow-[inset_0_0_0_1px_var(--accent-line)]",
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
      className={cn("chip outline-none transition-[background-color,color,border-color,transform] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]", active && "chip-on", className)}
    >
      {active && <Check className="h-3 w-3" strokeWidth={3} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-0.5">
        <span className="text-[13px] font-medium t-ink2">{label}</span>
        {hint && <span className="text-[12px] t-faint">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; secret?: boolean }>(
  function TextInput({ className, icon, secret, ...rest }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className={cn("field flex h-10 items-center gap-2 px-3", className)}>
        {icon && <span className="shrink-0 t-faint">{icon}</span>}
        <input
          ref={ref}
          {...rest}
          type={secret && !show ? "password" : secret ? "text" : rest.type}
          className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] t-ink outline-none placeholder:text-[var(--faint)]"
          autoComplete="off"
          spellCheck={false}
        />
        {secret && (
          <button type="button" onClick={() => setShow((s) => !s)} className="shrink-0 t-faint transition-colors hover-ink" aria-label="Toggle visibility">
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    );
  },
);

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={cn(
        "relative h-[22px] w-[38px] shrink-0 rounded-full outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:pointer-events-none disabled:opacity-40",
        on ? "bg-accent" : "bg-surface3 border border-[var(--line-strong)]",
      )}
    >
      <span
        className="absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-[240ms] ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ left: 2, transform: `translateX(${on ? 16 : 0}px)` }}
      />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="surface-flat relative grid rounded-[8px] p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <div
        className="absolute bottom-[3px] top-[3px] rounded-[6px] bg-surface shadow-[var(--shadow-sm)] transition-transform duration-200"
        style={{ width: `calc((100% - 6px) / ${options.length})`, left: 3, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-label={o.label}
          aria-pressed={value === o.id}
          className={cn(
            "relative z-10 h-7 rounded-[6px] px-2.5 text-[12px] font-medium outline-none transition-colors",
            value === o.id ? "t-ink" : "t-muted hover-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
