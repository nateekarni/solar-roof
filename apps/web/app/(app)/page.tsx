export const dynamic = "force-dynamic";

import { Dashboard } from "../../features/dashboard/dashboard";

export default function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    start_date?: string;
    end_date?: string;
    month?: string;
    year?: string;
  }>;
}) {
  return <Dashboard searchParams={searchParams} />;
}
