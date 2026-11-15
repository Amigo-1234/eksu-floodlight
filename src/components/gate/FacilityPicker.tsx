import Link from "next/link";

export function FacilityPicker({ facilities, base }: { facilities: { id: string; name: string }[]; base: string }) {
  if (facilities.length === 0) {
    return <p className="rounded-2xl border border-line p-5 text-sm text-muted">You aren&apos;t assigned to any facility gate yet.</p>;
  }
  return (
    <div>
      <h1 className="font-display mb-4 text-4xl">Choose your gate</h1>
      <ul className="flex flex-col gap-2">
        {facilities.map((f) => (
          <li key={f.id}>
            <Link href={`${base}?facility=${f.id}`} className="flex h-16 items-center rounded-2xl border border-line bg-surface px-4 text-lg font-semibold hover:border-signal">
              {f.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
