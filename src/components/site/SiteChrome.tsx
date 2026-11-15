import Link from "next/link";
import { CalendarDays, LayoutGrid, ScanLine, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { getViewer, canUseAdmin, canUseGate } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { isBackendConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buttonClass } from "@/components/ui";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="sm:hidden"><Logo compact /></div>
        <div className="hidden sm:block"><Logo /></div>
        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
          <Link href="/facilities" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-flex">Facilities</Link>
          <Link href="/facilities" aria-label="Facilities" className="inline-flex items-center rounded-lg px-2.5 py-2 text-muted hover:text-ink min-[401px]:hidden">
            <LayoutGrid className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/schedule" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted hover:text-ink">
            <CalendarDays className="size-4 sm:hidden" aria-hidden="true" /><span className="max-sm:sr-only">Schedule</span>
          </Link>
          {canUseAdmin(viewer) && (
            <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted hover:text-ink">
              <ShieldCheck className="size-4" aria-hidden="true" /><span className="max-md:sr-only">Admin</span>
            </Link>
          )}
          {canUseGate(viewer) && (
            <Link href="/gate" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted hover:text-ink">
              <ScanLine className="size-4" aria-hidden="true" /><span className="max-md:sr-only">Gate</span>
            </Link>
          )}
          {viewer ? (
            <Link href="/dashboard" className={buttonClass("outline", "sm", "ml-1")}>
              <UserRound className="size-4" aria-hidden="true" /><span className="max-sm:sr-only">My bookings</span>
            </Link>
          ) : (
            <Link href="/sign-in" className={buttonClass("outline", "sm", "ml-1")}>Sign in</Link>
          )}
          <Link href="/facilities" className={buttonClass("signal", "sm", "ml-1 max-[400px]:hidden")}>
            <LayoutGrid className="size-4 sm:hidden" aria-hidden="true" />Book
          </Link>
        </nav>
      </div>
    </header>
  );
}

async function supportContact(): Promise<{ email: string | null; phone: string | null }> {
  if (!isBackendConfigured()) return { email: null, phone: null };
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("platform_settings").select("support_email, support_phone").eq("id", 1).maybeSingle();
    return { email: data?.support_email ?? null, phone: data?.support_phone ?? null };
  } catch {
    return { email: null, phone: null };
  }
}

export async function SiteFooter() {
  const support = await supportContact();
  return (
    <footer className="mt-auto border-t border-line bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="text-sm text-muted">{brand.tagline}</p>
          <p className="text-xs leading-relaxed text-faint">{brand.endorsementNotice}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-0.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Explore</p>
          <Link href="/facilities" className="inline-flex min-h-9 items-center text-ink/90 hover:text-signal">Facilities</Link>
          <Link href="/schedule" className="inline-flex min-h-9 items-center text-ink/90 hover:text-signal">Schedule</Link>
          <Link href="/policies" className="inline-flex min-h-9 items-center text-ink/90 hover:text-signal">Booking policies &amp; privacy</Link>
          <Link href="/dashboard" className="inline-flex min-h-9 items-center text-ink/90 hover:text-signal">My bookings</Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Support</p>
          {support.email || support.phone ? (
            <>
              {support.email && <a href={`mailto:${support.email}`} className="inline-flex min-h-9 items-center text-ink/90 hover:text-signal">{support.email}</a>}
              {support.phone && <a href={`tel:${support.phone.replace(/\s/g, "")}`} className="inline-flex min-h-9 items-center text-ink/90 hover:text-signal">{support.phone}</a>}
            </>
          ) : (
            <p className="text-muted">Support contact details will appear here once the facility managers publish them.</p>
          )}
          <p className="text-xs text-faint">Times are shown in West Africa Time (Africa/Lagos).</p>
        </div>
      </div>
    </footer>
  );
}

export function BackendNotice() {
  if (isBackendConfigured()) return null;
  return (
    <div className="border-b border-warn/40 bg-warn/10 px-4 py-1.5 text-center text-xs text-warn sm:text-sm" role="status">
      Backend not connected<span className="hidden sm:inline">: set the Supabase variables to load facilities and bookings</span>.
    </div>
  );
}
