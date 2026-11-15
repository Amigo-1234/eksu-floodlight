"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { History, ListChecks, ScanLine } from "lucide-react";
import { Suspense } from "react";

function Inner() {
  const path = usePathname();
  const f = useSearchParams().get("facility");
  const qs = f ? `?facility=${f}` : "";
  const items = [
    { href: "/gate", label: "Today", icon: ListChecks, active: path === "/gate" },
    { href: "/gate/scan", label: "Scan", icon: ScanLine, active: path.startsWith("/gate/scan") },
    { href: "/gate/history", label: "History", icon: History, active: path.startsWith("/gate/history") },
  ];
  return (
    <nav aria-label="Gate" className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30">
      <ul className="glass mx-auto grid max-w-xl grid-cols-3 rounded-[26px] border border-line-strong p-1.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.95)]">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={href}>
            <Link href={`${href}${qs}`} aria-current={active ? "page" : undefined}
              className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-[20px] text-xs font-bold transition-colors ${active ? "bg-signal/[0.13] text-signal" : "text-muted"}`}>
              <Icon className="size-6" aria-hidden="true" />{label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function GateNav() {
  return <Suspense><Inner /></Suspense>;
}
