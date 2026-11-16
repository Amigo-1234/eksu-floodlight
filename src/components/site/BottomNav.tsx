"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Home, LayoutGrid, UserRound } from "lucide-react";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import { activeTab } from "@/lib/nav-scroll";

type Item = { href: string; label: string; icon: typeof Home };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/facilities", label: "Book", icon: LayoutGrid },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck2 },
  { href: "/dashboard/profile", label: "Profile", icon: UserRound },
];

/**
 * Docked tab bar for the signed-in customer area on phones. It slides away
 * while scrolling down or typing and returns on scroll up; pages reserve its
 * height (`.pb-nav`) so nothing is ever underneath it at the end of a page.
 */
export function BottomNav() {
  const path = usePathname();
  const current = activeTab(path);
  const { visible } = useHideOnScroll();
  return <TabBar label="Account" items={ITEMS} current={current} visible={visible} className="sm:hidden" />;
}

export function TabBar({ label, items, current, visible, className = "" }:
  { label: string; items: Item[]; current: string | null; visible: boolean; className?: string }) {
  return (
    <nav aria-label={label} data-visible={visible} className={`bottom-nav no-print ${className}`}>
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label: text, icon: Icon }) => {
          const active = current === href.split("?")[0];
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                // Hidden bar must not stay in the tab order.
                tabIndex={visible ? undefined : -1}
                className={`relative flex h-[var(--nav-h)] flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors duration-200 ${active ? "text-signal" : "text-muted hover:text-ink"}`}>
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-signal shadow-[0_0_10px_var(--signal)]" aria-hidden="true" />}
                <Icon className="size-[22px]" aria-hidden="true" />{text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
