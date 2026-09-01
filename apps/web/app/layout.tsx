import type { ReactNode } from "react";

export const metadata = {
  title: "Solar Energy Management Platform",
  description: "Monorepo foundation for the solar energy management platform"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

