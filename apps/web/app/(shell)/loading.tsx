import { Skeleton } from '@/components/ui/skeleton';

export default function ShellLoading() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลด">
      <div className="mb-6 flex items-end justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-9 w-40 rounded-control sm:block" />
      </div>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="h-9 bg-raised" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-12 items-center gap-4 border-t border-rule px-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
