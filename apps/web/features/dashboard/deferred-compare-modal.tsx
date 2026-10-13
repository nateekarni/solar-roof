"use client";

import * as React from "react";
import { Button } from "../../components/ui/button";
import { useLocale } from "../../providers/locale-provider";
import type { CompareModalProps } from "./compare-modal";

const CompareModal = React.lazy(() =>
  import("./compare-modal").then((module) => ({ default: module.CompareModal })),
);

export function DeferredCompareModal(props: CompareModalProps) {
  const [requested, setRequested] = React.useState(false);
  const th = useLocale() === "th";

  if (!requested) {
    return (
      <Button variant="outline" onClick={() => setRequested(true)}>
        {th ? "เปรียบเทียบไซต์" : "Compare sites"}
      </Button>
    );
  }

  return (
    <React.Suspense
      fallback={
        <Button variant="outline" disabled>
          {th ? "เปรียบเทียบไซต์" : "Compare sites"}
        </Button>
      }
    >
      <CompareModal {...props} initialOpen />
    </React.Suspense>
  );
}
