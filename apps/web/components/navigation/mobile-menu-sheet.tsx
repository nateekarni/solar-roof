"use client";
import { useSessionUser } from "../../providers/session-user-provider";

import {
  ChevronDown,
  Globe,
  Laptop,
  LogOut,
  Moon,
  Palette,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { apiClient } from "../../lib/api-client";
import { useLocale, useSetLocale, useT } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";
import { getNavItems, navLabel } from "./nav-config";

export interface MobileMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileMenuSheet({ open, onOpenChange }: MobileMenuSheetProps) {
  const pathname = usePathname();
  const user = useSessionUser();
  const navItems = getNavItems(user.role);
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { clear } = useAuth();

  // Track expanded groups
  const [expandedKeys, setExpandedKeys] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navItems.forEach((item) => {
      if (item.subItems) {
        // Auto expand if currently on this section or any of its subItems
        initial[item.key] =
          Boolean(item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)))) ||
          item.subItems.some(
            (sub) =>
              pathname === sub.href ||
              (sub.href !== "/settings" && pathname.startsWith(sub.href + "/"))
          );
      }
    });
    return initial;
  });

  // Auto-expand group when pathname changes
  React.useEffect(() => {
    navItems.forEach((item) => {
      if (
        item.subItems &&
        (Boolean(item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)))) ||
          item.subItems.some(
            (sub) =>
              pathname === sub.href ||
              (sub.href !== "/settings" && pathname.startsWith(sub.href + "/"))
          ))
      ) {
        setExpandedKeys((prev) => ({ ...prev, [item.key]: true }));
      }
    });
  }, [pathname]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when mobile menu is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleLinkClick = () => {
    onOpenChange(false);
  };

  const handleLogout = async () => {
    try {
      await apiClient.post("/v1/auth/logout");
    } catch {}
    clear();
    onOpenChange(false);
    router.push("/login");
    router.refresh();
  };

  const handleLanguageChange = async (nextLocale: "th" | "en") => {
    await setLocale(nextLocale);
  };

  const handleThemeChange = async (nextTheme: "light" | "dark" | "system") => {
    setTheme(nextTheme);
    apiClient.put("/v1/me/preferences", { preferredTheme: nextTheme }).catch(() => {});
  };

  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : "AD";

  const roleLabel =
    user?.role === "owner"
      ? t("profile.owner")
      : user?.role === "admin"
      ? t("profile.admin")
      : t("profile.schoolUser");

  const currentAction = searchParams?.get("action");

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground animate-in fade-in duration-200">
      {/* Top Header of Mobile Menu */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <Sun className="size-4.5" />
          </div>
          <span className="font-bold text-base text-sidebar-foreground tracking-tight">
            Solar Platform
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          className="size-11 rounded-full text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </Button>
      </div>

      {/* Main Nav Items (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasSubItems = Boolean(item.subItems && item.subItems.length > 0);
          const isParentActive =
            Boolean(item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)))) ||
            (hasSubItems &&
              item.subItems?.some(
                (sub) =>
                  pathname === sub.href ||
                  (sub.href !== "/settings" && pathname.startsWith(sub.href + "/"))
              ));
          const isExpanded = !!expandedKeys[item.key];

          if (hasSubItems && item.subItems) {
            return (
              <div key={item.key} className="rounded-lg overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroup(item.key)}
                  className={`h-auto min-h-11 gap-0 px-0 flex w-full items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isParentActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="size-4.5 shrink-0 text-sidebar-foreground/90" />
                    <span>{navLabel(item, locale, t)}</span>
                  </div>
                  <ChevronDown
                    className={`size-4 shrink-0 text-sidebar-foreground/60 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </Button>

                {isExpanded && (
                  <div className="ml-4 pl-3.5 my-1 space-y-1 border-l border-sidebar-border/80">
                    {item.subItems.map((sub) => {
                      const isSubActive =
                        pathname === sub.href ||
                        (sub.href !== "/settings" && pathname.startsWith(sub.href + "/"));

                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={handleLinkClick}
                          className={`flex min-h-11 items-center px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                            isSubActive
                              ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <span className="truncate">{navLabel(sub, locale, t)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Items without sub-items
          const isActive =
            Boolean(item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))));
          return (
            <Link
              key={item.key}
              href={item.href || "#"}
              onClick={handleLinkClick}
              className={`flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="size-4.5 shrink-0" />
              <span>
                {navLabel(item, locale, t) === item.labelKey && item.key === "system"
                  ? locale === "en"
                    ? "System Flow"
                    : "ผังระบบ"
                  : navLabel(item, locale, t)}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Footer Section: User Profile + Preferences + Logout */}
      <div className="border-t border-sidebar-border bg-sidebar-accent/30 p-3.5 space-y-3">
        {/* User Card */}
        <div className="flex items-center gap-3 px-1">
          <Avatar className="size-9 border border-sidebar-border">
            <AvatarFallback className="bg-primary/25 text-sidebar-primary font-bold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-sidebar-foreground">
              {user?.displayName || "Admin"}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">
              {user?.email || "admin@solar-roof.com"}
            </p>
            <Badge
              variant="secondary"
              className="mt-0.5 text-[9px] px-1.5 py-0 h-4 font-normal bg-sidebar-primary/20 text-sidebar-primary border-sidebar-primary/30"
            >
              {roleLabel}
            </Badge>
          </div>
        </div>

        {/* Language & Theme Controls */}
        <div className="space-y-2 pt-2 border-t border-sidebar-border/50">
          {/* Language Switch */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground">
              <Globe className="size-3.5 text-sidebar-foreground/70" />
              <span>{t("profile.language")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-sidebar-accent/40 p-1 border border-sidebar-border/80">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleLanguageChange("th")}
                aria-pressed={locale === "th"}
                title="ไทย"
                className={`h-auto gap-0 px-0 size-7.5 flex items-center justify-center rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  locale === "th"
                    ? "bg-primary text-primary-foreground shadow-xs scale-105"
                    : "bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground border border-border/50 shadow-2xs"
                }`}
              >
                <span>TH</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleLanguageChange("en")}
                aria-pressed={locale === "en"}
                title="English"
                className={`h-auto gap-0 px-0 size-7.5 flex items-center justify-center rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  locale === "en"
                    ? "bg-primary text-primary-foreground shadow-xs scale-105"
                    : "bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground border border-border/50 shadow-2xs"
                }`}
              >
                <span>EN</span>
              </Button>
            </div>
          </div>

          {/* Theme Switch */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground">
              <Palette className="size-3.5 text-sidebar-foreground/70" />
              <span>{t("profile.theme")}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-sidebar-accent/40 p-1 border border-sidebar-border/80">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleThemeChange("light")}
                aria-pressed={theme === "light"}
                aria-label={t("profile.light")}
                title={t("profile.light")}
                className={`h-auto gap-0 px-0 size-7.5 flex items-center justify-center rounded-md transition-all cursor-pointer ${
                  theme === "light"
                    ? "bg-primary text-primary-foreground shadow-xs scale-105"
                    : "bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground border border-border/50 shadow-2xs"
                }`}
              >
                <Sun className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleThemeChange("dark")}
                aria-pressed={theme === "dark"}
                aria-label={t("profile.dark")}
                title={t("profile.dark")}
                className={`h-auto gap-0 px-0 size-7.5 flex items-center justify-center rounded-md transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-primary text-primary-foreground shadow-xs scale-105"
                    : "bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground border border-border/50 shadow-2xs"
                }`}
              >
                <Moon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => handleThemeChange("system")}
                aria-pressed={theme === "system"}
                aria-label={t("profile.system")}
                title={t("profile.system")}
                className={`h-auto gap-0 px-0 size-7.5 flex items-center justify-center rounded-md transition-all cursor-pointer ${
                  theme === "system"
                    ? "bg-primary text-primary-foreground shadow-xs scale-105"
                    : "bg-muted/80 text-foreground/80 hover:bg-muted hover:text-foreground border border-border/50 shadow-2xs"
                }`}
              >
                <Laptop className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={handleLogout}
          className="h-auto min-h-11 gap-0 px-0 flex w-full items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 border border-destructive/20 transition-colors cursor-pointer"
        >
          <LogOut className="size-3.5" />
          <span>{t("auth.logout")}</span>
        </Button>
      </div>
    </div>,
    document.body
  );
}
