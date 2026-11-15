import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { ArtLamp } from "@/components/brand/Illustrations";
import { stagger } from "@/components/ui";

const PERKS = ["Live availability for every facility", "Instant or staff-reviewed confirmation", "A signed QR pass for the gate", "All your receipts in one place"];

/** Split-screen frame for every auth page: art + perks on the left (desktop), the form card on the right. */
export function AuthShell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="floodlight-sky relative flex flex-1 overflow-hidden">
      <div className="pitch-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_440px] lg:py-16">
        <div className="hidden flex-col gap-6 lg:flex">
          <ArtLamp className="-ml-6 h-72 w-72" />
          <div>
            <p className="font-display text-5xl leading-[0.95]">Book the lights.<br /><span className="text-beam">Own the night.</span></p>
            <ul className="stagger mt-6 flex flex-col gap-3">
              {PERKS.map((p, i) => (
                <li key={p} style={stagger(i)} className="flex items-center gap-3 text-ink/85">
                  <CheckCircle2 className="size-5 text-signal" aria-hidden="true" />{p}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="panel glow-ring animate-rise relative w-full overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-signal/15 blur-3xl" aria-hidden="true" />
          <ArtLamp className="relative -mb-2 -ml-3 -mt-4 h-24 w-24 lg:hidden" />
          <p className="eyebrow relative">{eyebrow}</p>
          <h1 className="font-display relative mt-2 text-[40px] leading-[0.98]">{title}</h1>
          {subtitle && <p className="relative mb-6 mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="relative">{children}</div>
        </div>
      </div>
    </div>
  );
}
