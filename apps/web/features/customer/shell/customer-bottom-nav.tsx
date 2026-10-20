"use client";

import { FileText, House, UserRound } from "lucide-react";
import Link from "next/link";
import { useT } from "../../../providers/locale-provider";

const destinations = [
  { href: "/", key: "home", icon: House },
  { href: "/billing", key: "documents", icon: FileText },
  { href: "/settings", key: "account", icon: UserRound },
] as const;

export function CustomerNavigationLinks({ pathname }: { pathname: string }) {
  const t = useT();
  return destinations.map(({ href, key, icon: Icon }) => {
    const active = href === "/" ? pathname === "/" :
      pathname === href || pathname.startsWith(`${href}/`) ||
      (href === "/billing" && pathname.startsWith("/records/billing/"));
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined} className="customer-nav-link">
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span>{t(`customerPortal.shell.${key}`)}</span>
      </Link>
    );
  });
}

export function CustomerBottomNav({ pathname }: { pathname: string }) {
  const t = useT();
  return (
    <nav aria-label={t("customerPortal.shell.mobileNavigation")} className="customer-bottom-nav md:hidden">
      <div className="customer-container grid grid-cols-3 gap-2">
        <CustomerNavigationLinks pathname={pathname} />
      </div>
    </nav>
  );
}
