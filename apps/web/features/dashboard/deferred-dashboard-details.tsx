"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { DashboardDetails } from "./dashboard-details";

const Details = dynamic(
  () => import("./dashboard-details").then((module) => module.DashboardDetails),
  {
    ssr: false,
    loading: () => (
      <section
        aria-busy="true"
        aria-label="Dashboard details"
        className="min-h-[420px] animate-pulse rounded-xl border bg-card"
      />
    ),
  },
);

export function DeferredDashboardDetails(props: ComponentProps<typeof DashboardDetails>) {
  return <Details {...props} />;
}
