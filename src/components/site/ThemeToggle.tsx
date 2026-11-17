"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cx } from "@/components/ui";
import { resolveTheme, THEME_COLOR, THEME_KEY, type ThemePref } from "@/lib/theme";

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function apply(pref: ThemePref) {
  const root = document.documentElement;
  const theme = resolveTheme(pref, window.matchMedia("(prefers-color-scheme: light)").matches);
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-pref", pref);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
  window.setTimeout(() => root.classList.remove("theme-switching"), 260);
}

function usePref(): [ThemePref | null, (p: ThemePref) => void] {
  // null until mounted: the server can't know the stored choice (avoids a hydration mismatch).
  const [pref, setPref] = useState<ThemePref | null>(null);
  useEffect(() => {
    const read = () => setPref((document.documentElement.getAttribute("data-theme-pref") as ThemePref) || "system");
    read();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystem = () => { if ((document.documentElement.getAttribute("data-theme-pref") || "system") === "system") apply("system"); };
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) { apply((e.newValue as ThemePref) || "system"); read(); } };
    mq.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => { mq.removeEventListener("change", onSystem); window.removeEventListener("storage", onStorage); };
  }, []);
  const choose = (p: ThemePref) => {
    try { if (p === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, p); } catch { /* private mode: still applies for this visit */ }
    apply(p);
    setPref(p);
  };
  return [pref, choose];
}

/** Segmented Light / Dark / System control. */
export function ThemeToggle({ className = "", showLabels = false }: { className?: string; showLabels?: boolean }) {
  const [pref, choose] = usePref();
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cx("inline-flex items-center gap-0.5 rounded-xl border border-line-strong bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = pref === value;
        return (
          <button key={value} type="button" role="radio" aria-checked={on} aria-label={label} title={label}
            onClick={() => choose(value)}
            className={cx("inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-xs font-bold transition-colors",
              showLabels ? "flex-1 px-3" : "w-8",
              on ? "bg-signal text-signal-ink" : "text-muted hover:bg-ink/[0.06] hover:text-ink")}>
            <Icon className="size-4" aria-hidden="true" />{showLabels && label}
          </button>
        );
      })}
    </div>
  );
}
