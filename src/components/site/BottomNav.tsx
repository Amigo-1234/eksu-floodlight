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

/** Bottom navigation for the signed-in customer area on phones only. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-signal" : "text-muted"}`}>
                <Icon className="size-[22px]" aria-hidden="true" />{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
