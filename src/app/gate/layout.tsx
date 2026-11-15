import { Logo } from "@/components/brand/Logo";
import { BackendNotice } from "@/components/site/SiteChrome";
import { GateNav } from "@/components/gate/GateNav";
import { requireGate } from "@/lib/gate";

export default async function GateLayout({ children }: LayoutProps<"/gate">) {
  const ctx = await requireGate("/gate");
  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg">
      <BackendNotice />
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Logo href="/gate" compact />
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ctx.live ? "bg-ok text-bg" : "bg-warn text-bg"}`}>
            {ctx.live ? "LIVE ADMISSION" : "TEST MODE"}
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 pb-28 pt-4">{children}</main>
      <GateNav />
    </div>
  );
}
