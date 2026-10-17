import {BRAND_NAME} from "../components/brand/brand-identity";
import { BRAND_PRIMARY } from "@solar/domain";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { ThemeProvider } from "../components/theme-provider";
import { QueryProvider } from "../providers/query-provider";

export const metadata = {
  title: `${BRAND_NAME} · แพลตฟอร์มจัดการพลังงาน`,
  description: "Solar energy management and billing platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning style={{ "--brand-primary": BRAND_PRIMARY } as CSSProperties}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster position="top-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
