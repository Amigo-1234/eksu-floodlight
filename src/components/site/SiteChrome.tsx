import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
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
const footLink = "inline-flex min-h-9 items-center text-muted transition-colors hover:text-signal";

/** Minimal footer: brand, a few links, support contact, the endorsement notice. */
export async function SiteFooter() {
  const support = await supportContact();
  return (
    <footer className="no-print mt-auto border-t border-line bg-bg-2">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-sm text-xs leading-relaxed text-faint">{brand.endorsementNotice}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 text-sm">
          <Link href="/facilities" className={footLink}>Facilities</Link>
          <Link href="/schedule" className={footLink}>Schedule</Link>
          <Link href="/policies" className={footLink}>Policies &amp; privacy</Link>
          {support.email && <a href={`mailto:${support.email}`} className={footLink}>{support.email}</a>}
          {support.phone && <a href={`tel:${support.phone.replace(/\s/g, "")}`} className={footLink}>{support.phone}</a>}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl border-t border-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
        © {YEAR} {brand.name} · Times in WAT
      </p>
    </footer>
  );
}

export function BackendNotice() {
  if (isBackendConfigured()) return null;
  return (
    <div className="border-b border-warn/30 bg-[var(--banner-bg)] px-4 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-warn" role="status">
      Backend not connected<span className="hidden sm:inline"> · set the Supabase variables to load facilities and bookings</span>
    </div>
  );
}
