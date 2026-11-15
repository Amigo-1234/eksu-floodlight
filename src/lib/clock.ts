/** Request-time clock for server components (each render is a fresh request). */
export function nowMs(): number {
  return Date.now();
}
