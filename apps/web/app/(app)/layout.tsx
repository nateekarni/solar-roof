import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Locale } from "@solar/i18n";
import { AppHeader } from "../../components/navigation/app-header";
import { AppSidebar } from "../../components/navigation/app-sidebar";
import { SidebarInset, SidebarProvider } from "../../components/ui/sidebar";
import { LocaleProvider } from "../../providers/locale-provider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) || "th";

  return (
    <LocaleProvider initialLocale={locale}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="flex flex-col h-svh overflow-hidden">
          <AppHeader />
          <div className="flex-1 overflow-y-auto overflow-x-hidden w-full">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </LocaleProvider>
  );
}
