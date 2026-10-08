import { canVisitPage } from "@solar/domain";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Settings2,
  Zap,
} from "lucide-react";

export interface NavSubItem {
  href: string;
  labelKey: string;
}

export interface NavItem {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  href?: string | undefined;
  subItems?: NavSubItem[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    labelKey: "navigation.dashboard",
    icon: LayoutDashboard,
    href: "/",
  },
{
    key: "sites",
    labelKey: "navigation.sites",
    icon: MapPin,
    href: "/sites",
  },
  {
    key: "alerts",
    labelKey: "navigation.alerts",
    icon: AlertTriangle,
    href: "/alerts",
  },
  {
    key: "contractsAndDocs",
    labelKey: "navigation.contractsAndDocs",
    icon: ScrollText,
    href: "",
    subItems: [
      { href: "/contracts", labelKey: "navigation.contracts" },
      { href: "/billing", labelKey: "navigation.billing" },
      { href: "/receipts", labelKey: "navigation.receipts" },
    ],
  },
  {
    key: "settings",
    labelKey: "navigation.systemSettings",
    icon: Settings2,
    href: "/settings",
    subItems: [
      { href: "/settings/account", labelKey: "settings.account" },
      { href: "/settings/security", labelKey: "settings.security" },
      { href: "/settings/company", labelKey: "navigation.companyAndBanking" },
      { href: "/settings/system", labelKey: "navigation.systemDefaults" },
      { href: "/settings/meter-presets", labelKey: "navigation.meterPresets" },
      { href: "/settings/audit", labelKey: "navigation.audit" },
      { href: "/settings/users", labelKey: "navigation.users" },
    ],
  },
];

export function getNavItems(role: string): NavItem[] {
 if (role === "school_user") return [
   { key: "dashboard", labelKey: "dashboard", icon: LayoutDashboard, href: "/" },
   { key: "documents", labelKey: "navigation.documents", icon: ScrollText, href: "/contracts" },
   { key: "settings", labelKey: "navigation.settings", icon: Settings2, href: "/settings" },
 ].filter(item => canVisitPage(role, item.href));
 return NAV_ITEMS.flatMap(item => {
 const subItems = item.subItems?.filter(sub => canVisitPage(role, sub.href));
 const href = item.href && canVisitPage(role, item.href) ? item.href : undefined;
 if (!href && !subItems?.length) return [];
 return [{ ...item, labelKey: item.key === "settings" && role === "owner" ? "navigation.ownerSettings" : item.key === "settings" && role === "school_user" ? "navigation.personalSettings" : item.labelKey, href, ...(subItems ? { subItems } : {}) }];
 });
}
export function getBottomNavItems(role: string): NavItem[] {
 const keys = role === "school_user" ? ["dashboard","documents","settings"] : role === "owner" ? ["dashboard","contractsAndDocs","settings"] : ["dashboard","sites","alerts","settings"];
 return getNavItems(role).filter(item => keys.includes(item.key)).map(item => ({...item, href:item.href || item.subItems?.find(sub => sub.href === "/billing")?.href || item.subItems?.[0]?.href}));
}

export function navLabel(item: {labelKey: string; href?: string | undefined; key?: string}, locale: string, t: (key: string) => string): string {
 const labels: Record<string, [string,string]> = { "navigation.documents":["เอกสาร","Documents"], "navigation.settings":["การตั้งค่า","Settings"], "navigation.ownerSettings":["บัญชีและบริษัท","Account and company"], "navigation.personalSettings":["บัญชีของฉัน","My account"], dashboard:["หน้าแรก","Home"], production:["การผลิตไฟฟ้า","Production"], "/settings/account":["บัญชีผู้ใช้","Account"], "/settings/general":["การแสดงผล","Preferences"], "/settings/security":["ความปลอดภัย","Security"] };
 const label=labels[item.labelKey] || labels[item.key || item.href || ""];
 return label ? label[locale === "en" ? 1 : 0] : t(item.labelKey);
}
