"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Building2, CircleDollarSign, FileText, Gauge, LayoutDashboard, ScrollText, Settings, Users, Zap } from "lucide-react";
import { t } from "@solar/i18n";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";

const items = [
  { href: "/", label: t("navigation.dashboard"), icon: LayoutDashboard }, { href: "/schools", label: t("navigation.schools"), icon: Building2 }, { href: "/sites", label: t("navigation.sites"), icon: Gauge }, { href: "/billing", label: t("navigation.billing"), icon: CircleDollarSign }, { href: "/documents", label: t("navigation.documents"), icon: FileText }, { href: "/reports", label: t("navigation.reports"), icon: Activity }, { href: "/users", label: t("navigation.users"), icon: Users }, { href: "/contracts", label: t("navigation.contracts"), icon: ScrollText }, { href: "/audit", label: t("navigation.audit"), icon: FileText }, { href: "/settings", label: t("navigation.settings"), icon: Settings }, { href: "/alerts", label: t("navigation.alerts"), icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="sidebar" aria-label="เมนูหลัก"><div className="brand"><Zap className="brand-mark" aria-hidden="true" /><span>Solar Billing</span></div><nav>{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "nav-item active" : "nav-item"}><Icon aria-hidden="true" />{label}</Link>)}</nav><div className="sidebar-footer"><Avatar className="avatar"><AvatarFallback>O</AvatarFallback></Avatar><div><strong>Owner</strong><small>ผู้บริหารระบบ</small></div></div></aside>;
}
