"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function FacilitySwitcher({ facilities, allowAll = true }: { facilities: { id: string; name: string }[]; allowAll?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const current = params.get("facility") ?? "";
  if (facilities.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Facility</span>
      <select value={current} onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value) p.set("facility", e.target.value); else p.delete("facility");
        router.push(`${path}?${p.toString()}`);
      }} className="h-10 max-w-56 rounded-xl border border-line bg-surface px-3 text-ink">
        {allowAll && <option value="">All my facilities</option>}
        {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </label>
  );
}
