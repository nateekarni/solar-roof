import { getSessionUser } from "../../lib/session-user";
import { SessionUserProvider } from "../../providers/session-user-provider";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Locale } from "@solar/i18n";
import { AppHeader } from "../../components/navigation/app-header";
import { AppSidebar } from "../../components/navigation/app-sidebar";
import { MobileBottomNav } from "../../components/navigation/mobile-bottom-nav";
import { SidebarInset, SidebarProvider } from "../../components/ui/sidebar";
import { LocaleProvider } from "../../providers/locale-provider";
import { SiteSelectionProvider } from "../../features/dashboard/site-selection-provider";
import { CustomerAppShell } from "../../features/customer/shell/customer-app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) || "th";

  return (
    <LocaleProvider initialLocale={locale}>
      <SessionUserProvider user={user}><SiteSelectionProvider>{user?.role === "customer_user" ? (
        <CustomerAppShell>{children}</CustomerAppShell>
      ) : <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="flex flex-col h-svh overflow-hidden">
          <AppHeader />
          <div className="flex-1 overflow-y-auto overflow-x-hidden w-full bg-muted dark:bg-background pb-20 md:pb-0">
            {children}
          </div>
          <MobileBottomNav />
        </SidebarInset>
      </SidebarProvider>}</SiteSelectionProvider></SessionUserProvider>
    </LocaleProvider>
  );
}
