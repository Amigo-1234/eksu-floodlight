"use client";

import type { ReactNode } from "react";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";

/**
 * Phone-only call-to-action docked to the bottom edge with the same
 * hide-on-scroll / keyboard behaviour as the tab bar. From `sm` up it renders
 * inline in the page flow instead.
 */
export function SmartDock({ children }: { children: ReactNode }) {
  const { visible } = useHideOnScroll();
  return (
    <>
      <div data-visible={visible} className="bottom-nav no-print px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:hidden">
        {children}
      </div>
      <div className="no-print mx-auto mt-10 hidden max-w-6xl px-4 sm:block">
        <div className="glass glow-ring rounded-[24px] px-6 py-4">{children}</div>
      </div>
    </>
  );
}
