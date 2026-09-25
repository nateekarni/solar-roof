export const dynamic = "force-dynamic";

import * as React from "react";
import { PowerFlowCard } from "../../../features/dashboard/power-flow-card";

export default function SystemPage() {
  return (
    <main className="content p-3 sm:p-4 md:p-6 w-full max-w-full min-w-0 overflow-x-hidden">
      <PowerFlowCard />
    </main>
  );
}
