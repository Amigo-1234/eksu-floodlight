"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { CalendarDays, LayoutGrid, Menu, ScanLine, ShieldCheck, Ticket, UserRound, X } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";

type Props = { signedIn: boolean; firstName: string | null; admin: boolean; gate: boolean };

const LINKS = [
  { href: "/facilities", label: "Facilities", icon: LayoutGrid },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
];

/** Header navigation: inline links on desktop, an animated sheet on phones. */
export function HeaderNav({ signedIn, firstName, admin, gate }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) { setLastPath(path); setOpen(false); }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const staff = [
    ...(admin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
    ...(gate ? [{ href: "/gate", label: "Gate", icon: ScanLine }] : []),
  ];
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {[...LINKS, ...staff].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={cx("relative inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors",
              active(href) ? "text-ink" : "text-muted hover:text-ink")}>
            {staff.some((s) => s.href === href) && <Icon className="size-4 text-signal" aria-hidden="true" />}
            {label}
            {active(href) && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-signal shadow-[0_0_12px_var(--signal)]" aria-hidden="true" />}
          </Link>
        ))}
        <span className="mx-2 h-6 w-px bg-line" aria-hidden="true" />
        {signedIn ? (
          <Link href="/dashboard" className={buttonClass("outline", "sm")}>
            <UserRound className="size-4" aria-hidden="true" />{firstName ?? "My bookings"}
          </Link>
        ) : (
          <Link href="/sign-in" className={buttonClass("ghost", "sm")}>Sign in</Link>
        )}
        <Link href="/facilities" className={buttonClass("signal", "sm", "ml-1")}><Ticket className="size-4" aria-hidden="true" />Book a slot</Link>
      </nav>

      <div className="flex items-center gap-2 md:hidden">
        <Link href="/facilities" className={buttonClass("signal", "sm")}>Book</Link>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu"
          className="inline-flex size-10 items-center justify-center rounded-xl border border-line-strong bg-white/[0.03] text-ink transition-colors hover:border-signal/50">
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full z-40 h-[calc(100dvh-4rem)] md:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[page-in_200ms_ease-out_both]" />
          <div className="glass relative mx-3 mt-2 rounded-3xl border border-line-strong p-3 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] animate-rise">
            <ul className="stagger flex flex-col gap-1">
              {[...LINKS, ...staff, signedIn
                ? { href: "/dashboard", label: "My bookings", icon: UserRound }
                : { href: "/sign-in", label: "Sign in", icon: UserRound }].map(({ href, label, icon: Icon }, i) => (
                <li key={href} style={{ "--i": i } as CSSProperties}>
                  <Link href={href} aria-current={active(href) ? "page" : undefined}
                    className={cx("flex h-14 items-center gap-3 rounded-2xl px-4 text-[17px] font-bold transition-colors",
                      active(href) ? "bg-signal/[0.12] text-signal" : "text-ink hover:bg-white/[0.04]")}>
                    <Icon className="size-5" aria-hidden="true" />{label}
                  </Link>
                </li>
              ))}
            </ul>
            {!signedIn && (
              <Link href="/sign-up" className={buttonClass("signal", "lg", "mt-3 w-full")}>Create a free account</Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
