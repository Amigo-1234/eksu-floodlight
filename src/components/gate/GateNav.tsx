"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { History, ListChecks, ScanLine } from "lucide-react";
import { Suspense } from "react";
import { TabBar } from "@/components/site/BottomNav";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";

function Inner() {
  const path = usePathname();
  const f = useSearchParams().get("facility");
  const qs = f ? `?facility=${f}` : "";
  const { visible } = useHideOnScroll();
  const current = path.startsWith("/gate/scan") ? "/gate/scan" : path.startsWith("/gate/history") ? "/gate/history" : path === "/gate" ? "/gate" : null;
  const items = [
    { href: `/gate${qs}`, label: "Today", icon: ListChecks },
    { href: `/gate/scan${qs}`, label: "Scan", icon: ScanLine },
    { href: `/gate/history${qs}`, label: "History", icon: History },
  ];
  // The bar also hides while the camera or a verdict is on screen (html[data-gate-focus], set by the scanner).
  return <TabBar label="Gate" items={items} current={current} visible={visible} className="gate-nav" />;
}

export function GateNav() {
  return <Suspense><Inner /></Suspense>;
}
