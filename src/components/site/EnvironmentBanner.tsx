/**
 * A slim strip shown only when NEXT_PUBLIC_APP_ENV is explicitly a non-live
 * label (test / staging / preview / development), so a staging copy can never
 * be mistaken for the real service. Unset or "production" shows nothing.
 */
const NON_LIVE = new Set(["test", "staging", "preview", "development"]);

export function isTestEnvironment(): boolean {
  return NON_LIVE.has((process.env.NEXT_PUBLIC_APP_ENV ?? "").toLowerCase());
}

export function EnvironmentBanner() {
  if (!isTestEnvironment()) return null;
  return (
    <div role="note" className="no-print relative z-40 border-b border-warn/25 bg-[var(--banner-bg)] px-3 py-1 text-center font-mono text-[10.5px] uppercase tracking-[0.16em] text-warn">
      Staging copy · bookings here don&apos;t reserve real facilities
    </div>
  );
}
