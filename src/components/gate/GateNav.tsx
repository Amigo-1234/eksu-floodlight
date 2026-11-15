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
    <nav aria-label="Gate" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={href}>
            <Link href={`${href}${qs}`} aria-current={active ? "page" : undefined}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? "text-signal" : "text-muted"}`}>
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
