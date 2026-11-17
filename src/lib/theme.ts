/** Theme preference: stored per device in localStorage under THEME_KEY. */
export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "fl-theme";
export const THEME_COLOR = { light: "#f6f3ec", dark: "#050608" } as const;

export function resolveTheme(pref: string | null | undefined, systemPrefersLight: boolean): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return systemPrefersLight ? "light" : "dark";
}

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Kept tiny and dependency-free; mirrors resolveTheme().
 */
export const THEME_BOOT_SCRIPT = `(function(){var d=document.documentElement,p=null;try{p=localStorage.getItem("${THEME_KEY}")}catch(e){}var l=false;try{l=matchMedia("(prefers-color-scheme: light)").matches}catch(e){}var t=p==="light"||p==="dark"?p:(l?"light":"dark");d.setAttribute("data-theme",t);d.setAttribute("data-theme-pref",p==="light"||p==="dark"?p:"system");})();`;
