"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  Receipt,
  ScrollText,
  Settings2,
  Zap,
} from "lucide-react";
import * as React from "react";
import { useAuth } from "../../stores/auth-store";
import { cn } from "../../lib/utils";

interface MobileTab {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || "owner";

  const tabs: MobileTab[] = React.useMemo(() => {
    if (role === "school_user") {
      return [
        {
          label: "หน้าแรก",
          href: "/",
          icon: LayoutDashboard,
        },
        {
          label: "ใบแจ้งหนี้",
          href: "/billing",
          icon: Receipt,
        },
        {
          label: "ตั้งค่า",
          href: "/settings",
          icon: Settings2,
        },
      ];
    }

    if (role === "admin") {
      return [
        {
          label: "ภาพรวม",
          href: "/",
          icon: LayoutDashboard,
        },
        {
          label: "ไซต์งาน",
          href: "/sites",
          icon: MapPin,
        },
        {
          label: "แจ้งเตือน",
          href: "/alerts",
          icon: AlertTriangle,
        },
        {
          label: "ตั้งค่า",
          href: "/settings",
          icon: Settings2,
        },
      ];
    }

    // Owner role (default)
    return [
      {
        label: "หน้าแรก",
        href: "/",
        icon: LayoutDashboard,
      },
      {
        label: "ไซต์งาน",
        href: "/sites",
        icon: MapPin,
      },
      {
        label: "เอกสาร",
        href: "/billing",
        icon: ScrollText,
      },
      {
        label: "ตั้งค่า",
        href: "/settings",
        icon: Settings2,
      },
    ];
  }, [role]);

  // Don't render inside login or public pages
  if (pathname === "/login") return null;

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/80 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href + tab.label}
              href={tab.href}
              className={cn(
                "group relative flex flex-col items-center justify-center min-w-[56px] py-1.5 px-2 rounded-lg text-xs font-medium transition-all select-none active:scale-95",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative flex items-center justify-center mb-1">
                <Icon
                  className={cn(
                    "size-5 transition-all",
                    isActive
                      ? "text-primary stroke-[2.25px] scale-110"
                      : "text-muted-foreground stroke-[1.75px] group-hover:text-foreground"
                  )}
                />
                {tab.badge && (
                  <span className="absolute -top-1 -right-1.5 size-2 bg-destructive rounded-full ring-2 ring-background" />
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] leading-none tracking-tight transition-colors",
                  isActive
                    ? "font-semibold text-primary"
                    : "font-normal text-muted-foreground group-hover:text-foreground"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
