"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Globe,
  Laptop,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings2,
  Shield,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { MobileMenuSheet } from "./mobile-menu-sheet";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { ResponsivePopover } from "../../components/ui/responsive-popover";
import { Separator } from "../../components/ui/separator";
import { SidebarTrigger } from "../../components/ui/sidebar";
import { apiClient } from "../../lib/api-client";
import { useLocale, useSetLocale, useT } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";

interface AlertItem {
  id: string;
  severity: string;
  title: string;
  detail: string;
  status: string;
  occurredAt?: string;
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { user, clear, setAuth } = useAuth();

  const [notificationOpen, setNotificationOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [activeAlertCount, setActiveAlertCount] = React.useState(0);
  const [loadingAlerts, setLoadingAlerts] = React.useState(false);

  // Fetch current user if not initialized
  React.useEffect(() => {
    if (!user) {
      apiClient
        .get<any>("/v1/auth/me")
        .then((userData) => {
          if (userData && userData.id) {
            setAuth(userData);
          }
        })
        .catch(() => {});
    }
  }, [user, setAuth]);

  // Fetch active alerts count on mount and on open
  const fetchAlerts = React.useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        apiClient.get<{ rows: AlertItem[] }>("/v1/operations/alerts").catch(() => ({ rows: [] })),
        apiClient.get<{ label: string; value: number }[]>("/v1/operations/alerts/summary").catch(() => []),
      ]);

      setAlerts(listRes.rows.slice(0, 5));
      const activeItem = summaryRes.find((s) => s.label.includes("active") || s.label.includes("ใช้งาน"));
      setActiveAlertCount(Number(activeItem?.value ?? listRes.rows.filter((r) => r.status !== "acknowledged").length));
    } catch {
      // ignore
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  React.useEffect(() => {
    if (notificationOpen) {
      fetchAlerts();
    }
  }, [notificationOpen, fetchAlerts]);

  const handleLogout = async () => {
    try {
      await apiClient.post("/v1/auth/logout");
    } catch {}
    clear();
    setProfileOpen(false);
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

  const getPageTitle = (path: string) => {
    switch (path) {
      case "/":
        return t("dashboard.title");
      case "/schools":
        return t("navigation.schools");
      case "/sites":
        return t("navigation.sites");
      case "/billing":
        return t("navigation.billing");
      case "/contracts":
        return t("navigation.contracts");
      case "/receipts":
        return t("navigation.receipts");
      case "/reports":
        return t("navigation.reports");
      case "/alerts":
        return t("navigation.alerts");
      case "/notifications":
        return t("navigation.notifications");
      case "/users":
      case "/settings/users":
        return t("navigation.users");
      case "/audit":
      case "/settings/audit":
        return t("navigation.audit");
      case "/settings":
        return t("navigation.systemSettings");
      case "/settings/meter-presets":
        return t("navigation.meterPresets");
      default:
        return t("app.title");
    }
  };

  const pageTitle = getPageTitle(pathname);
  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : "AD";

  const roleLabel =
    user?.role === "owner"
      ? t("profile.owner")
      : user?.role === "admin"
      ? t("profile.admin")
      : t("profile.schoolUser");

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3.5 backdrop-blur-sm md:px-6">
      {/* Desktop Left: Sidebar Trigger & Breadcrumb */}
      <div className="hidden md:flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href="/"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Solar Platform
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="size-3 text-muted-foreground" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs font-semibold text-foreground">
                {pageTitle}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Mobile Left: Brand Logo & Title */}
      <div className="flex md:hidden items-center gap-2 min-w-0">
        <div className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs">
          <Sun className="size-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-[13px] leading-tight text-foreground truncate">
            Solar Platform
          </span>
          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[140px]">
            {pageTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Notification Responsive Popover / Mobile Drawer */}
        <ResponsivePopover
          open={notificationOpen}
          onOpenChange={setNotificationOpen}
          title={t("notifications.header")}
          popoverClassName="w-80 max-w-[calc(100vw-2rem)] p-0 shadow-lg rounded-xl"
          sheetClassName="max-h-[85vh] p-0 flex flex-col gap-0 rounded-t-2xl overflow-hidden"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("navigation.alerts")}
              className="relative size-8.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Bell className="size-4" />
              {activeAlertCount > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-card animate-pulse" />
              )}
            </Button>
          }
        >
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("notifications.header")}
              </span>
              {activeAlertCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="h-4.5 px-1.5 text-[10px] font-medium rounded-full bg-destructive/15 text-destructive"
                >
                  {t("notifications.badge", { count: activeAlertCount })}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="h-4.5 px-1.5 text-[10px] font-medium rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                >
                  {t("notifications.allClear")}
                </Badge>
              )}
            </div>
            <Link
              href="/alerts"
              onClick={() => setNotificationOpen(false)}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {t("notifications.viewAll")}
            </Link>
          </div>

          <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
            {loadingAlerts ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-500/70 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.noAlerts")}
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <Link
                  key={alert.id}
                  href="/alerts"
                  onClick={() => setNotificationOpen(false)}
                  className="flex items-start gap-2.5 p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="grid size-6 shrink-0 place-items-center rounded-md bg-destructive/15 text-destructive mt-0.5">
                    <AlertTriangle className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <strong className="truncate text-xs font-semibold text-foreground">
                        {alert.title}
                      </strong>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {alert.status === "acknowledged"
                          ? t("notifications.acknowledged")
                          : alert.severity || "alarm"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {alert.detail}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="border-t border-border p-2 bg-muted/20">
            <Link
              href="/notifications"
              onClick={() => setNotificationOpen(false)}
              className="flex items-center justify-center w-full py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("notifications.allNotifications")}
            </Link>
          </div>
        </ResponsivePopover>

        {/* Profile Popover with Language & Theme Switches (Desktop) */}
        <div className="hidden md:block">
          <Popover open={profileOpen} onOpenChange={setProfileOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={t("profile.userMenu")}
              >
                <Avatar className="size-8.5 border border-border cursor-pointer hover:opacity-90">
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-72 p-0 shadow-xl rounded-xl border border-border"
            >
              {/* User Profile Header */}
              <div className="flex items-center gap-3 p-3.5 border-b border-border bg-muted/30">
                <Avatar className="size-10 border border-border">
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">
                    {user?.displayName || "Admin User"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {user?.email || "admin@solar-roof.com"}
                  </p>
                  <Badge
                    variant="secondary"
                    className="mt-1 text-[9px] px-1.5 py-0 h-4 font-normal bg-primary/15 text-primary border-primary/20"
                  >
                    {roleLabel}
                  </Badge>
                </div>
              </div>

              {/* Quick Preferences Toggles */}
              <div className="p-3 border-b border-border/80 space-y-2.5 bg-card">
                {/* Language Switch */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Globe className="size-3.5 text-muted-foreground" />
                    <span>{t("profile.language")}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 border border-border/50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLanguageChange("th");
                      }}
                      title="ไทย"
                      aria-label="ไทย"
                      className={`flex items-center justify-center size-7 rounded-md text-sm transition-all cursor-pointer ${
                        locale === "th"
                          ? "bg-background text-foreground shadow-xs font-semibold scale-105"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <span className="leading-none text-base">🇹🇭</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLanguageChange("en");
                      }}
                      title="English"
                      aria-label="English"
                      className={`flex items-center justify-center size-7 rounded-md text-sm transition-all cursor-pointer ${
                        locale === "en"
                          ? "bg-background text-foreground shadow-xs font-semibold scale-105"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <span className="leading-none text-base">🇬🇧</span>
                    </button>
                  </div>
                </div>

                {/* Theme Switch */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Palette className="size-3.5 text-muted-foreground" />
                    <span>{t("profile.theme")}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 border border-border/50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleThemeChange("light");
                      }}
                      title={t("profile.light")}
                      aria-label={t("profile.light")}
                      className={`flex items-center justify-center size-7 rounded-md text-xs transition-all cursor-pointer ${
                        theme === "light"
                          ? "bg-background text-foreground shadow-xs scale-105"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <Sun className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleThemeChange("dark");
                      }}
                      title={t("profile.dark")}
                      aria-label={t("profile.dark")}
                      className={`flex items-center justify-center size-7 rounded-md text-xs transition-all cursor-pointer ${
                        theme === "dark"
                          ? "bg-background text-foreground shadow-xs scale-105"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <Moon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleThemeChange("system");
                      }}
                      title={t("profile.system")}
                      aria-label={t("profile.system")}
                      className={`flex items-center justify-center size-7 rounded-md text-xs transition-all cursor-pointer ${
                        theme === "system"
                          ? "bg-background text-foreground shadow-xs scale-105"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      }`}
                    >
                      <Laptop className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="p-1.5 space-y-0.5 text-xs">
                <Link
                  href="/settings/users"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-foreground hover:bg-muted transition-colors"
                >
                  <User className="size-4 text-muted-foreground" />
                  <span>{t("profile.manageUsers")}</span>
                </Link>
                <Link
                  href="/settings/audit"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-foreground hover:bg-muted transition-colors"
                >
                  <Shield className="size-4 text-muted-foreground" />
                  <span>{t("profile.auditHistory")}</span>
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-foreground hover:bg-muted transition-colors"
                >
                  <Settings2 className="size-4 text-muted-foreground" />
                  <span>{t("profile.systemSettings")}</span>
                </Link>
              </div>

              {/* Logout Button */}
              <div className="p-1.5 border-t border-border">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <LogOut className="size-4" />
                  <span>{t("auth.logout")}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Mobile Hamburger Trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          className="flex md:hidden size-8.5 rounded-full text-foreground hover:bg-muted"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </Button>
      </div>

      {/* Full-Screen Mobile Menu */}
      <MobileMenuSheet
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
      />
    </header>
  );
}
