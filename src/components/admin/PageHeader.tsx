import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow = "Console" }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow flex items-center gap-2"><span className="h-px w-5 bg-signal/70" aria-hidden="true" />{eyebrow}</p>
        <h1 className="font-display mt-2 text-4xl sm:text-[46px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "warn" | "danger" | "ok" }) {
  const color = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink";
  const glow = tone === "warn" ? "bg-warn/20" : tone === "danger" ? "bg-danger/20" : tone === "ok" ? "bg-ok/15" : "bg-signal/10";
  return (
    <div className="panel lift relative overflow-hidden p-5">
      <span className={`pointer-events-none absolute -right-8 -top-8 size-24 rounded-full blur-2xl ${glow}`} aria-hidden="true" />
      <p className="relative font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className={`font-display relative mt-2 text-[40px] leading-none tabular ${color}`}>{value}</p>
      {hint && <p className="relative mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}
