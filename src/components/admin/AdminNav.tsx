"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3, Building2, CalendarCog, CalendarRange, LayoutDashboard, ScanLine, Settings, Users, Wallet,
} from "lucide-react";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarRange },
  { href: "/admin/facilities", label: "Facilities", icon: Building2 },
  { href: "/admin/availability", label: "Availability", icon: CalendarCog },
  { href: "/admin/check-ins", label: "Check-ins", icon: ScanLine },
  { href: "/admin/payments", label: "Payments", icon: Wallet },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/staff", label: "Staff", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

export function AdminNav({ isOwner }: { isOwner: boolean }) {
  const path = usePathname();
  const params = useSearchParams();
  const facility = params.get("facility");
  const qs = facility ? `?facility=${facility}` : "";
  const items = ITEMS.filter((i) => !i.ownerOnly || isOwner);
  return (
    <nav aria-label="Admin sections">
      <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0 lg:pb-0">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link href={`${href}${qs}`} aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-bold transition-colors duration-200 max-lg:border ${active ? "bg-signal/[0.12] text-signal max-lg:border-signal/40" : "text-muted hover:bg-white/[0.04] hover:text-ink max-lg:border-line"}`}>
                {active && <span className="absolute -left-px top-2 bottom-2 hidden w-[3px] rounded-full bg-signal shadow-[0_0_10px_var(--signal)] lg:block" aria-hidden="true" />}
                <Icon className="size-4" aria-hidden="true" />{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
