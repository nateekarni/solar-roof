"use client";

import * as React from "react";
import { SystemSettingsContent } from "../../../../features/settings/system-settings-content";

export default function SystemSettingsPage() {
  return (
    <main className="content">
      <SystemSettingsContent showBackLink={true} />
    </main>
  );
}
