import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";

export default function Loading() {
  return (
    <main className="content">
      {/* Top Header Skeleton */}
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-8 w-72 rounded-md" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>

      {/* Top 6 Stat Cards Skeleton */}
      <section className="stats-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card className="stat-card" key={i}>
            {/* Row 1: Icon + Label */}
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md shrink-0" />
              <Skeleton className="h-3 w-20" />
            </div>
            {/* Row 2: Number + Badge */}
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-14 rounded-full shrink-0" />
            </div>
          </Card>
        ))}
      </section>

      {/* 3-Column Main Dashboard Skeleton */}
      <section className="dashboard-3col">
        {/* Left Column Map Skeleton */}
        <Card className="panel map-panel min-h-[480px] flex flex-col">
          <div className="border-b border-border py-3 px-4 flex items-center justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="flex-1 p-4 flex items-center justify-center">
            <Skeleton className="h-[380px] w-full rounded-lg" />
          </div>
          {/* Site Info Bar Skeleton */}
          <div className="border-t border-border px-5 py-2.5 flex items-center justify-between bg-card min-h-[52px]">
            <div className="space-y-1">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <div className="flex gap-5">
              <div className="space-y-1 items-end flex flex-col">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-2 w-12" />
              </div>
              <div className="space-y-1 items-end flex flex-col">
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-2 w-10" />
              </div>
            </div>
          </div>
        </Card>

        {/* Center Column Chart Skeletons */}
        <div className="chart-stack">
          <Card className="panel p-4">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-7 w-48 rounded-md" />
            </div>
            <Skeleton className="h-[180px] w-full rounded-md" />
          </Card>
          <Card className="panel p-4">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-7 w-48 rounded-md" />
            </div>
            <Skeleton className="h-[180px] w-full rounded-md" />
          </Card>
        </div>

        {/* Right Column Skeletons */}
        <div className="right-stack">
          <Card className="panel p-4">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-md" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="panel p-4">
            <Skeleton className="h-4 w-28 mb-3" />
            <div className="flex items-center justify-center py-4">
              <Skeleton className="size-32 rounded-full" />
            </div>
          </Card>
        </div>
      </section>

      {/* Bottom Rankings Skeleton */}
      <section className="mt-4">
        <Card className="panel p-4">
          <Skeleton className="h-4 w-52 mb-3" />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
