import { Skeleton } from "@/components/ui";

/** Shimmering placeholder that mirrors a typical page: heading, filters, card grid. */
export function PageSkeleton({ cards = 6, narrow = false }: { cards?: number; narrow?: boolean }) {
  return (
    <div className={`mx-auto w-full ${narrow ? "max-w-3xl" : "max-w-6xl"} px-4 py-10`} role="status" aria-label="Loading">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-10 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-sm" />
      <div className="mt-8 flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-24 rounded-full" />)}</div>
      <div className={`mt-8 grid gap-4 ${narrow ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className={narrow ? "h-24" : "h-64"} />)}
      </div>
    </div>
  );
}
