/** Client-safe, DOM-free auth rules (unit-tested). */

/** The same rules as `newPassword`, shown live while typing. Exported for tests. */
export const PASSWORD_RULES = [
  { id: "len", label: "At least 8 characters", test: (v: string) => v.length >= 8 && v.length <= 72 },
  { id: "letter", label: "Contains a letter", test: (v: string) => /[A-Za-z]/.test(v) },
  { id: "number", label: "Contains a number", test: (v: string) => /[0-9]/.test(v) },
] as const;

/**
 * With email confirmation on, Supabase answers a sign-up for an existing
 * address with a user that has no identities (to avoid account enumeration by
 * outsiders). Exported for tests.
 */
export function isExistingAccountResponse(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
