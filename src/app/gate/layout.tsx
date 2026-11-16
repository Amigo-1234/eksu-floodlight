import { Logo } from "@/components/brand/Logo";
import { BackendNotice } from "@/components/site/SiteChrome";
import { GateNav } from "@/components/gate/GateNav";
import { requireGate } from "@/lib/gate";

export default async function GateLayout({ children }: LayoutProps<"/gate">) {
  const ctx = await requireGate("/gate");
  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg">
      <BackendNotice />
      <header className="glass sticky top-0 z-30 border-b border-line/80">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Logo href="/gate" compact />
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10.5px] font-medium tracking-[0.14em] ${ctx.live ? "border-ok/40 bg-ok/10 text-ok" : "border-warn/40 bg-warn/10 text-warn"}`}>
            <span className="live-dot size-1.5 rounded-full bg-current" aria-hidden="true" />{ctx.live ? "LIVE ADMISSION" : "TEST MODE"}
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-nav pt-4">{children}</main>
      <GateNav />
    </div>
  );
}
