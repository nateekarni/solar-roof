"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items = [{ href: "/", label: "ภาพรวม", icon: "⌂" }, { href: "/schools", label: "โรงเรียน", icon: "▣" }, { href: "/sites", label: "ไซต์และ Gateway", icon: "⌁" }, { href: "/billing", label: "การเรียกเก็บเงิน", icon: "฿" }, { href: "/documents", label: "เอกสาร", icon: "▤" }, { href: "/reports", label: "รายงาน", icon: "◫" }];
export function Sidebar() { const pathname = usePathname(); return <aside className="sidebar" aria-label="เมนูหลัก"><div className="brand"><span className="brand-mark">☼</span><span>Solar Billing</span></div><nav>{items.map(item => <Link key={item.href} href={item.href} className={pathname === item.href ? "nav-item active" : "nav-item"}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav><div className="sidebar-footer"><div className="avatar">O</div><div><strong>Owner</strong><small>ผู้บริหารระบบ</small></div></div></aside>; }
