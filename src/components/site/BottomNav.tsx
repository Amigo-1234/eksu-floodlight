"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Home, LayoutGrid, UserRound } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home, match: (p: string) => p === "/dashboard" },
  { href: "/facilities", label: "Book", icon: LayoutGrid, match: (p: string) => p.startsWith("/book") || p.startsWith("/facilities") },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck2, match: (p: string) => p.startsWith("/dashboard/bookings") || p.startsWith("/booking/") },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/dashboard/profile") },
];

/** Floating tab bar for the signed-in customer area on phones. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="no-print fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 sm:hidden">
      <ul className="glass grid grid-cols-4 rounded-[26px] border border-line-strong p-1.5 shadow-[0_20px_50px_-15px_rgb(0_0_0/0.95)]">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-bold transition-colors duration-200 ${active ? "bg-signal/[0.13] text-signal" : "text-muted"}`}>
                <Icon className={`size-[21px] transition-transform duration-200 ${active ? "-translate-y-0.5" : ""}`} aria-hidden="true" />{label}
                {active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-signal shadow-[0_0_8px_var(--signal)]" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
