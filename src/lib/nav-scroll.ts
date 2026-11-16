/** Pure, DOM-free parts of the bottom-bar behaviour (unit-tested). */

/** Tunables (px). Exported for tests. */
export const NAV_SCROLL = {
  /** Always show the bar this close to the top of the page. */
  topZone: 48,
  /** Distance scrolled DOWN (continuously) before the bar hides. */
  hideAfter: 24,
  /** Distance scrolled UP (continuously) before the bar returns. */
  showAfter: 12,
  /** Within this distance of the end of the page the bar returns (content is padded so it never covers anything). */
  bottomZone: 24,
} as const;

/**
 * Pure step function for the hide-on-scroll state machine, so the behaviour
 * is unit-testable without a DOM. `travel` accumulates movement in the current
 * direction; reversing direction resets it, which is what stops jitter from
 * small back-and-forth movements (and iOS rubber-banding).
 */
export function nextNavState(
  prev: { visible: boolean; lastY: number; travel: number },
  y: number,
  maxY: number,
): { visible: boolean; lastY: number; travel: number } {
  // Ignore elastic overscroll above the top / below the bottom (iOS bounce).
  const clamped = Math.min(Math.max(y, 0), Math.max(maxY, 0));
  const delta = clamped - prev.lastY;
  if (clamped <= NAV_SCROLL.topZone) return { visible: true, lastY: clamped, travel: 0 };
  if (maxY - clamped <= NAV_SCROLL.bottomZone) return { visible: true, lastY: clamped, travel: 0 };
  if (delta === 0) return prev;
  const sameDir = Math.sign(delta) === Math.sign(prev.travel);
  const travel = sameDir ? prev.travel + delta : delta;
  if (travel >= NAV_SCROLL.hideAfter && prev.visible) return { visible: false, lastY: clamped, travel: 0 };
  if (travel <= -NAV_SCROLL.showAfter && !prev.visible) return { visible: true, lastY: clamped, travel: 0 };
  return { visible: prev.visible, lastY: clamped, travel };
}

/** The customer tab that is active for a path — exactly one, or none (most specific prefix wins). */
export function activeTab(path: string): string | null {
  if (path.startsWith("/dashboard/profile")) return "/dashboard/profile";
  if (path.startsWith("/dashboard/bookings") || path.startsWith("/booking/")) return "/dashboard/bookings";
  if (path === "/dashboard") return "/dashboard";
  if (path.startsWith("/book") || path.startsWith("/facilities")) return "/facilities";
  return null;
}
