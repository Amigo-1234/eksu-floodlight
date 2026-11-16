import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { HeaderNav } from "@/components/site/HeaderNav";
import { getViewer, canUseAdmin, canUseGate } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { isBackendConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="glass no-print sticky top-0 z-30 border-b border-line/80">
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <HeaderNav signedIn={!!viewer} firstName={viewer?.fullName ? viewer.fullName.split(" ")[0] : null}
          admin={canUseAdmin(viewer)} gate={canUseGate(viewer)} />
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

const YEAR = new Date().getFullYear();
const footLink = "inline-flex min-h-9 items-center text-ink/80 transition-colors hover:text-signal";

export async function SiteFooter() {
  const support = await supportContact();
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-line bg-bg-2">
      <div className="pointer-events-none absolute -top-px left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-signal/60 to-transparent" aria-hidden="true" />
      <LogoMark size={340} plain className="pointer-events-none absolute -bottom-24 -right-16 opacity-[0.05]" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="font-display text-2xl text-ink/90">Your game,<br /><span className="text-beam">under the lights.</span></p>
          <p className="max-w-sm text-xs leading-relaxed text-faint">{brand.endorsementNotice}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-0.5 text-sm">
          <p className="eyebrow mb-2">Explore</p>
          <Link href="/facilities" className={footLink}>Facilities</Link>
          <Link href="/schedule" className={footLink}>Schedule</Link>
          <Link href="/dashboard" className={footLink}>My bookings</Link>
          <Link href="/policies" className={footLink}>Booking policies &amp; privacy</Link>
        </nav>
        <div className="flex flex-col gap-1 text-sm">
          <p className="eyebrow mb-2">Help</p>
          {support.email && <a href={`mailto:${support.email}`} className={footLink}>{support.email}</a>}
          {support.phone && <a href={`tel:${support.phone.replace(/\s/g, "")}`} className={footLink}>{support.phone}</a>}
          {!support.email && !support.phone && <p className="text-muted">Questions about a booking? Contact the facility&apos;s managers on site.</p>}
          <p className="mt-2 text-xs text-faint">All times in West Africa Time.</p>
        </div>
      </div>
      <div className="relative border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-faint">
          © {YEAR} {brand.name} · {brand.location}
        </p>
      </div>
    </footer>
  );
}

export function BackendNotice() {
  if (isBackendConfigured()) return null;
  return (
    <div className="border-b border-warn/30 bg-[#140d04] px-4 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-warn" role="status">
      Backend not connected<span className="hidden sm:inline"> · set the Supabase variables to load facilities and bookings</span>
    </div>
  );
}
