import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/lib/status";

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
export { cx };

type Variant = "signal" | "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  signal: "bg-signal text-signal-ink hover:brightness-105 active:brightness-95",
  solid: "bg-ink text-bg hover:opacity-90",
  outline: "border border-line bg-surface text-ink hover:bg-raised",
  ghost: "text-ink hover:bg-raised",
  danger: "border border-danger/50 bg-transparent text-danger hover:bg-danger/10",
};
const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-[10px]",
  md: "h-11 px-4 text-[15px] rounded-xl",
  lg: "h-14 px-5 text-base rounded-[14px]",
};

export function buttonClass(variant: Variant = "signal", size: Size = "md", extra = "") {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[filter,background-color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variantClass[variant], sizeClass[size], extra);
}

export function Button({ variant = "signal", size = "md", className = "", ...props }:
  ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({ variant = "signal", size = "md", className = "", ...props }:
  ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("rounded-[var(--radius-card)] border border-line bg-surface", className)} />;
}

const toneClass: Record<Tone, string> = {
  ok: "bg-ok/12 text-ok border-ok/30",
  warn: "bg-warn/12 text-warn border-warn/35",
  danger: "bg-danger/12 text-danger border-danger/35",
  info: "bg-info/12 text-info border-info/30",
  muted: "bg-raised text-muted border-line",
  signal: "bg-signal text-signal-ink border-signal",
};

export function Chip({ tone = "muted", children, className = "", live = false }:
  { tone?: Tone; children: ReactNode; className?: string; live?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", toneClass[tone], className)}>
      {live && <span className="live-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Field({ id, label, hint, error, children, className = "" }:
  { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint aria-[invalid=true]:border-danger";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "appearance-auto", props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputClass, "h-auto min-h-24 py-3", props.className)} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-xl bg-raised", className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-2xl">{title}</p>
      {body && <div className="max-w-md text-sm text-muted">{body}</div>}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className = "" }:
  { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode; className?: string }) {
  const border = { info: "border-info/40", warn: "border-warn/45", danger: "border-danger/45", ok: "border-ok/40" }[tone];
  const text = { info: "text-info", warn: "text-warn", danger: "text-danger", ok: "text-ok" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cx("rounded-xl border bg-surface p-4 text-sm", border, className)}>
      {title && <p className={cx("mb-1 font-semibold", text)}>{title}</p>}
      <div className="text-muted">{children}</div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-signal">{eyebrow}</p>}
        <h2 className="font-display text-3xl sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function DevFixtureBadge() {
  return <Chip tone="warn">Development fixture — not a real EKSU facility</Chip>;
}
