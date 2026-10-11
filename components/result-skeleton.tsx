export function ResultSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-line bg-raised p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="w-full max-w-[18rem] space-y-2">
          <div className="h-4 w-2/3 rounded bg-line" />
          <div className="h-3 w-full rounded bg-line" />
        </div>
        <div className="h-6 w-24 shrink-0 rounded-full bg-line" />
      </div>
      <div className="mt-4 h-1 w-full rounded-full bg-line" />
      <div className="mt-5 space-y-2">
        <div className="h-3 w-full rounded bg-line" />
        <div className="h-3 w-[92%] rounded bg-line" />
        <div className="h-3 w-[70%] rounded bg-line" />
      </div>
      <div className="mt-5 flex gap-1.5">
        <div className="h-5 w-16 rounded-md bg-line" />
        <div className="h-5 w-20 rounded-md bg-line" />
        <div className="h-5 w-14 rounded-md bg-line" />
      </div>
    </div>
  );
}
