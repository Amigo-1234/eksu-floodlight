import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { BackendNotice } from "@/components/site/SiteChrome";
import { requireAdmin } from "@/lib/admin";
import { Chip } from "@/components/ui";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireAdmin("/admin");
  const role = ctx.isOwner ? "Owner" : ctx.adminOf.size > 0 ? "Facility admin" : "Scheduler";
  const name = ctx.viewer.fullName || ctx.viewer.email || "Staff";
  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-ink">
      <BackendNotice />
      <header className="glass sticky top-0 z-30 border-b border-line/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Logo href="/admin" compact size={32} />
            <span className="hidden rounded-md border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:inline">Console</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Chip tone="signal">{role}</Chip>
            <Link href="/" className="hidden items-center gap-1 rounded-xl px-3 py-2 font-bold text-muted transition-colors hover:text-ink sm:inline-flex">
              Public site<ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
            <form action="/auth/sign-out" method="post">
              <button className="inline-flex size-9 items-center justify-center rounded-xl border border-line-strong text-muted transition-colors hover:border-danger/50 hover:text-danger" title="Sign out">
                <LogOut className="size-4" aria-hidden="true" /><span className="sr-only">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 lg:flex-row lg:gap-8 lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:h-fit lg:w-56 lg:shrink-0">
          <div className="panel mb-3 hidden items-center gap-3 p-3 lg:flex">
            <span className="flex size-9 items-center justify-center rounded-xl bg-signal/15 font-display text-lg text-signal">{name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{name}</p>
              <p className="text-xs text-muted">{role}</p>
            </div>
          </div>
          <Suspense><AdminNav isOwner={ctx.isOwner} /></Suspense>
          {!ctx.viewer.roles.mfa_ok && (
            <p className="mt-3 rounded-2xl border border-warn/40 bg-warn/[0.06] p-3 text-xs text-warn">Two-factor authentication is required for staff. Set it up to use admin tools.</p>
          )}
        </aside>
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
