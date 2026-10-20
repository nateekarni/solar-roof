"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useLocale, useT } from "../../../providers/locale-provider";
import { CustomerBottomNav } from "./customer-bottom-nav";
import { CustomerTopNav } from "./customer-top-nav";

export function CustomerAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const locale = useLocale();
  const t = useT();
  return (
    <div className="customer-portal flex min-h-dvh min-w-0 flex-col" lang={locale}>
      <a className="customer-skip-link" href="#customer-main">{t("customerPortal.shell.skipToContent")}</a>
      <CustomerTopNav pathname={pathname} />
      <main id="customer-main" tabIndex={-1} className="customer-container customer-main flex-1">
        {children}
      </main>
      <CustomerBottomNav pathname={pathname} />
    </div>
  );
}
