"use client";

import dynamic from "next/dynamic";
import type { SiteMapProps } from "./site-map";

const SiteMap = dynamic(
  () => import("./site-map").then((module) => module.SiteMap),
  {
    ssr: false,
    loading: () => (
      <section
        aria-busy="true"
        aria-label="Site map"
        className="panel map-panel min-h-[350px] animate-pulse rounded-xl border bg-card"
      />
    ),
  },
);

export function DeferredSiteMap(props: SiteMapProps) {
  return <SiteMap {...props} />;
}
