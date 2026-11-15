import { Skeleton } from "@/components/ui";
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-9 w-64" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="mt-6 h-72" />
    </div>
  );
}
