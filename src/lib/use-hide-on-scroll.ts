"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { nextNavState } from "./nav-scroll";

const TEXT_INPUT = /^(text|email|tel|password|search|url|number|date|time|datetime-local|month|week)$/;
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT.test(el.type || "text");
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Visibility of a fixed bottom bar:
 *  - hides while scrolling down, returns on scroll up, at the top and at the end of the page;
 *  - hides while the on-screen keyboard is open (a text field has focus, or the
 *    visual viewport shrank), so it can never sit on top of the field being typed in;
 *  - resets to visible on every route change.
 * Server render and first client render are both "visible" (no hydration mismatch).
 */
export function useHideOnScroll(): { visible: boolean; keyboard: boolean } {
  const path = usePathname();
  const [visible, setVisible] = useState(true);
  const [keyboard, setKeyboard] = useState(false);
  const state = useRef({ visible: true, lastY: 0, travel: 0 });

  // Route change: show the bar and re-baseline from the new scroll position.
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) { setLastPath(path); setVisible(true); }
  useEffect(() => {
    state.current = { visible: true, lastY: typeof window === "undefined" ? 0 : window.scrollY, travel: 0 };
  }, [path]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        const next = nextNavState(state.current, window.scrollY, maxY);
        state.current = next;
        setVisible(next.visible);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    let focused = isTypingTarget(document.activeElement);
    let shrunk = false;
    const update = () => setKeyboard(focused || shrunk);
    const onFocusIn = (e: FocusEvent) => { focused = isTypingTarget(e.target as Element); update(); };
    // focusout fires before the next focusin when moving between fields; wait a tick.
    const onFocusOut = () => setTimeout(() => { focused = isTypingTarget(document.activeElement); update(); }, 50);
    const onViewport = () => {
      if (!vv) return;
      shrunk = vv.height < window.innerHeight * 0.75;
      update();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onViewport);
    update();
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onViewport);
    };
  }, []);

  return { visible: visible && !keyboard, keyboard };
}
