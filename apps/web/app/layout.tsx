import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: "Solar Billing · แพลตฟอร์มจัดการพลังงาน", description: "Solar energy monitoring and billing platform" };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="th"><body>{children}</body></html>; }
