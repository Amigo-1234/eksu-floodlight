import { Skeleton } from "@/components/ui";
export default function Loading() {
  return <div role="status" aria-label="Loading" className="flex flex-col gap-3"><Skeleton className="h-9 w-40" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
}
