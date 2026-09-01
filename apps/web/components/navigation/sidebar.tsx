"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Building2, CircleDollarSign, FileText, Gauge, LayoutDashboard, ScrollText, Settings, Users, Zap } from "lucide-react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";

const items = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard }, { href: "/schools", label: "โรงเรียน", icon: Building2 }, { href: "/sites", label: "ไซต์และ Gateway", icon: Gauge }, { href: "/billing", label: "การเรียกเก็บเงิน", icon: CircleDollarSign }, { href: "/documents", label: "เอกสาร", icon: FileText }, { href: "/reports", label: "รายงาน", icon: Activity }, { href: "/users", label: "ผู้ใช้งาน", icon: Users }, { href: "/contracts", label: "สัญญาและเรท", icon: ScrollText }, { href: "/audit", label: "Audit log", icon: FileText }, { href: "/settings", label: "ตั้งค่า", icon: Settings }, { href: "/alerts", label: "แจ้งเตือน", icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="sidebar" aria-label="เมนูหลัก"><div className="brand"><Zap className="brand-mark" aria-hidden="true" /><span>Solar Billing</span></div><nav>{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "nav-item active" : "nav-item"}><Icon aria-hidden="true" />{label}</Link>)}</nav><div className="sidebar-footer"><Avatar className="avatar"><AvatarFallback>O</AvatarFallback></Avatar><div><strong>Owner</strong><small>ผู้บริหารระบบ</small></div></div></aside>;
}
