import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  GraduationCap,
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
  href?: string;
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
    key: "system",
    labelKey: "navigation.system",
    icon: Zap,
    href: "/system",
  },
  {
    key: "schools",
    labelKey: "navigation.schools",
    icon: GraduationCap,
    href: "/schools",
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
      { href: "/settings/system", labelKey: "navigation.systemDefaults" },
      { href: "/settings/meter-presets", labelKey: "navigation.meterPresets" },
      { href: "/settings/audit", labelKey: "navigation.audit" },
      { href: "/settings/users", labelKey: "navigation.users" },
    ],
  },
];
