/**
 * Shown on every page unless NEXT_PUBLIC_APP_ENV=production, so a test or
 * staging deployment can never be mistaken for an official EKSU service and
 * test bookings are never presented as real reservations.
 */
export function isTestEnvironment(): boolean {
  return process.env.NEXT_PUBLIC_APP_ENV !== "production";
}

export function EnvironmentBanner() {
  if (!isTestEnvironment()) return null;
  return (
    <div role="note" className="no-print relative z-40 bg-[#ffb547] px-3 py-1.5 text-center text-[12px] font-semibold leading-tight text-[#0b100f]">
      TEST ENVIRONMENT<span className="sm:hidden"> · test data only, not an official EKSU service</span>
      <span className="hidden sm:inline"> — not an official EKSU service. Bookings here are test data and do not reserve real facilities.</span>
    </div>
  );
}
