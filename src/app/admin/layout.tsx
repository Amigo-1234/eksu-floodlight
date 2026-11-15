import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { BackendNotice } from "@/components/site/SiteChrome";
import { requireAdmin } from "@/lib/admin";
import { Chip } from "@/components/ui";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireAdmin("/admin");
  const role = ctx.isOwner ? "Platform owner" : ctx.adminOf.size > 0 ? "Facility admin" : "Scheduler";
  return (
    <div className="theme-day flex min-h-full flex-1 flex-col bg-bg text-ink">
      <BackendNotice />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Logo href="/admin" compact />
          <div className="flex items-center gap-3 text-sm">
            <Chip tone="info">{role}</Chip>
            <Link href="/" className="hidden text-muted hover:text-ink sm:inline">Public site</Link>
            <form action="/auth/sign-out" method="post"><button className="text-muted hover:text-ink">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 lg:flex-row lg:gap-8 lg:py-8">
        <aside className="lg:w-52 lg:shrink-0">
          <Suspense><AdminNav isOwner={ctx.isOwner} /></Suspense>
          {!ctx.viewer.roles.mfa_ok && (
            <p className="mt-3 rounded-xl border border-warn/50 p-3 text-xs text-warn">Two-factor authentication is required for staff. Set it up to use admin tools.</p>
          )}
        </aside>
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
