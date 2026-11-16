import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { Tone } from "@/lib/status";
import { ArtEmpty } from "@/components/brand/Illustrations";

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
export { cx };

/** Inline style helper for staggered reveals: <li style={stagger(i)}>. */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Variant = "signal" | "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  signal:
    "bg-[linear-gradient(180deg,#ffd166_0%,var(--signal)_45%,var(--signal-2)_100%)] text-signal-ink shadow-[0_10px_30px_-12px_rgb(255_197_61/0.75),inset_0_1px_0_rgb(255_255_255/0.45)] hover:shadow-[0_14px_38px_-12px_rgb(255_197_61/0.9),inset_0_1px_0_rgb(255_255_255/0.5)] hover:-translate-y-px",
  solid: "bg-ink text-bg hover:bg-white hover:-translate-y-px",
  outline:
    "border border-line-strong bg-white/[0.02] text-ink hover:border-signal/50 hover:bg-white/[0.05] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
  ghost: "text-muted hover:bg-white/[0.05] hover:text-ink",
  danger: "border border-danger/45 bg-danger/[0.06] text-danger hover:bg-danger/[0.12]",
};
const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-xl",
  md: "h-11 px-5 text-[14.5px] rounded-2xl",
  lg: "h-14 px-6 text-[15.5px] rounded-[18px]",
};

export function buttonClass(variant: Variant = "signal", size: Size = "md", extra = "") {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-bold tracking-[-0.005em] transition-[transform,box-shadow,background-color,border-color,color,filter] duration-200 ease-out active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
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
  return <div {...props} className={cx("panel", className)} />;
}

const toneClass: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/35",
  danger: "bg-danger/10 text-danger border-danger/35",
  info: "bg-info/10 text-info border-info/30",
  muted: "bg-white/[0.03] text-muted border-line-strong",
  signal: "bg-signal/[0.14] text-signal border-signal/40",
};

export function Chip({ tone = "muted", children, className = "", live = false }:
  { tone?: Tone; children: ReactNode; className?: string; live?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11.5px] font-bold tracking-[0.01em]", toneClass[tone], className)}>
      {live && <span className="live-dot h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Field({ id, label, hint, error, children, className = "" }:
  { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-bold text-ink/90">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="animate-rise text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-2xl border border-line-strong bg-[#090b0f] px-4 text-base text-ink shadow-[inset_0_2px_6px_rgb(0_0_0/0.35)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-faint hover:border-[#3b4256] focus:border-signal/70 focus:shadow-[0_0_0_4px_rgb(255_197_61/0.12),inset_0_2px_6px_rgb(0_0_0/0.35)] focus-visible:outline-none aria-[invalid=true]:border-danger/70 disabled:opacity-50";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

const chevron =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23a3a9b9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10";

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, "appearance-none", chevron, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(inputClass, "h-auto min-h-28 py-3 leading-relaxed", props.className)} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={cx("shimmer rounded-2xl", className)} />;
}

export function EmptyState({ title, body, action, art, className = "" }:
  { title: string; body?: ReactNode; action?: ReactNode; art?: ReactNode; className?: string }) {
  return (
    <div className={cx("panel relative flex flex-col items-center gap-3 overflow-hidden px-5 py-9 text-center sm:px-6 sm:py-12", className)}>
      <div className="pitch-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative floaty">{art ?? <ArtEmpty className="h-28 w-auto" />}</div>
      <p className="font-display t-section relative mt-1">{title}</p>
      {body && <div className="relative max-w-md text-sm leading-relaxed text-muted">{body}</div>}
      {action && <div className="relative mt-2">{action}</div>}
    </div>
  );
}

const noticeIcon = { info: Info, warn: AlertTriangle, danger: OctagonAlert, ok: CheckCircle2 } as const;

export function Notice({ tone = "info", title, children, className = "" }:
  { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode; className?: string }) {
  const color = { info: "text-info", warn: "text-warn", danger: "text-danger", ok: "text-ok" }[tone];
  const bar = { info: "bg-info", warn: "bg-warn", danger: "bg-danger", ok: "bg-ok" }[tone];
  const Icon = noticeIcon[tone];
  return (
    <div role={tone === "danger" ? "alert" : "note"}
      className={cx("animate-rise relative flex gap-3 overflow-hidden rounded-2xl border border-line bg-surface/90 p-4 pl-5 text-sm", className)}>
      <span className={cx("absolute inset-y-0 left-0 w-1", bar)} aria-hidden="true" />
      <Icon className={cx("mt-0.5 size-4 shrink-0", color)} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className={cx("mb-1 font-bold", color)}>{title}</p>}
        <div className="text-muted">{children}</div>
      </div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action, sub }: { eyebrow?: string; title: string; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 flex items-center gap-2"><span className="h-px w-6 bg-signal/70" aria-hidden="true" />{eyebrow}</p>}
        <h2 className="font-display t-page">{title}</h2>
        {sub && <p className="mt-2 max-w-xl text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Pill-style link used for filters and tab-like navigation. */
export function PillLink({ active, className = "", ...props }: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link {...props} aria-current={active ? "page" : undefined}
      className={cx("inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors duration-200",
        active ? "border-signal/60 bg-signal/[0.14] text-signal" : "border-line-strong text-muted hover:border-[#3b4256] hover:text-ink", className)} />
  );
}

export function DevFixtureBadge() {
  return <Chip tone="warn">Development fixture — not a real EKSU facility</Chip>;
}
