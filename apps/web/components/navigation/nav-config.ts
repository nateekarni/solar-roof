import { canVisitPage } from "@solar/domain";
import {settingsSections} from './settings-sections';
import {effectivePageAccess,type AuthorizationSnapshot} from '../../lib/effective-page-access';
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Settings2,
  Zap,
  Users,
  Radio,
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
  {key:"gateways",labelKey:"navigation.gateways",icon:Radio,href:"/gateways"},
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
      { href: "/settings/company", labelKey: "navigation.companyAndBanking" },
      { href: "/settings/rates", labelKey: "navigation.rates" },
      { href: "/settings/system", labelKey: "navigation.systemDefaults" },
      { href: "/settings/meter-presets", labelKey: "navigation.meterPresets" },
      { href: "/settings/audit", labelKey: "navigation.audit" },
      { href: "/settings/users", labelKey: "navigation.users" },
    ],
  },
];

export function getNavItems(role: string,authorization?:AuthorizationSnapshot): NavItem[] {
 const allowed=(href:string)=>effectivePageAccess({role,...(authorization?{authorization}:{})},href);
 if (role === "customer_user") return [
   { key: "dashboard", labelKey: "dashboard", icon: LayoutDashboard, href: "/" },
   { key: "billing", labelKey: "navigation.billing", icon: ScrollText, href: "/billing" },
   { key: "receipts", labelKey: "navigation.receipts", icon: ScrollText, href: "/receipts" },
   { key: "settings", labelKey: "navigation.customerSettings", icon: Settings2, href: "/settings" },
 ].filter(item => canVisitPage(role, item.href));
 return NAV_ITEMS.flatMap(item => {
 const subItems = item.key==='settings' ? settingsSections(role,authorization).flatMap(section=>section.items.map(entry=>({href:entry.href,labelKey:entry.href==='/settings/system'&&section.key==='technical'?'technicalDefaults':entry.href}))) : item.subItems?.filter(sub => allowed(sub.href));
 const href = item.href && allowed(item.href) ? item.href : undefined;
 if (!href && !subItems?.length) return [];
 return [{ ...item, labelKey: item.key === "settings" && role === "owner" ? "navigation.ownerSettings" : item.key === "settings" && role === "customer_user" ? "navigation.customerSettings" : item.labelKey, href, ...(subItems ? { subItems } : {}) }];
 });
}
export function getBottomNavItems(role: string,authorization?:AuthorizationSnapshot): NavItem[] {
 const keys = role === "customer_user" ? ["dashboard","billing","receipts","settings"] : role === "owner" ? ["dashboard","sites","contractsAndDocs","settings"] : ["dashboard","gateways","alerts","settings"];
 return getNavItems(role,authorization).filter(item => keys.includes(item.key)).map(item => ({...item, href:item.href || item.subItems?.find(sub => sub.href === "/billing")?.href || item.subItems?.[0]?.href}));
}

export function navLabel(item: {labelKey: string; href?: string | undefined; key?: string}, locale: string, t: (key: string) => string): string {
 if(item.labelKey==='technicalDefaults')return locale==='th'?'การรับข้อมูล':'Data reception';
 const settingsEntry=settingsSections('owner').concat(settingsSections('admin')).flatMap(section=>section.items).find(entry=>entry.href===item.labelKey);
 if(settingsEntry)return settingsEntry.label[locale==='en'?1:0];
 const billingLabels:Record<string,[string,string]>={"navigation.rates":["อัตราค่าไฟ","Electricity tariffs"],"navigation.billing":["ใบวางบิล","Billing statements"],"navigation.receipts":["ใบเสร็จรับเงิน","Receipts"],"navigation.customers":["ข้อมูลลูกค้า","Customers"],"navigation.gateways":["จัดการเกตเวย์","Manage gateways"],"navigation.contractsAndDocs":["เอกสาร","Documents"]};
 if(billingLabels[item.labelKey])return billingLabels[item.labelKey]![locale==='en'?1:0];
 const labels: Record<string, [string,string]> = { "navigation.documents":["เอกสาร","Documents"], "navigation.settings":["การตั้งค่า","Settings"], "navigation.ownerSettings":["การตั้งค่า","Settings"], "navigation.personalSettings":["บัญชีของฉัน","My account"], "navigation.customerSettings":["ข้อมูลองค์กรและบัญชี","Organization & Account"], dashboard:["หน้าแรก","Home"], production:["การผลิตไฟฟ้า","Production"], "/settings/account":["บัญชีของฉัน","My account"], "/settings/general":["การแสดงผล","Preferences"], "/settings/security":["ความปลอดภัย","Security"], "/settings/users":["ทีมงานและสิทธิ์","Staff and permissions"] };
 const label=labels[item.labelKey] || labels[item.key || item.href || ""];
 return label ? label[locale === "en" ? 1 : 0] : t(item.labelKey);
}
