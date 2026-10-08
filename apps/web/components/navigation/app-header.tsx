"use client";
import {BrandMark, BRAND_NAME} from "../brand/brand-mark";
import {ProfilePreferences} from "./profile-preferences";
import {acknowledgeAlertScope} from './acknowledge-alert-scope';
import {useSiteSelection} from '../../features/dashboard/site-selection-provider';
import type {DashboardSummaryResponse} from '@solar/api-contracts';
import { canVisitPage } from "@solar/domain";
import { useSessionUser } from "../../providers/session-user-provider";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CheckCheck,
  ChevronRight,
  Globe,
  Laptop,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings2,
  Shield,
  Sun,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { cn } from "../../lib/utils";
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
  const searchParams=useSearchParams();
  const {selectedSiteId}=useSiteSelection();
  const scopedDashboard=pathname==='/'&&Boolean(selectedSiteId);
  const notificationParams=new URLSearchParams();
  if(scopedDashboard){notificationParams.set('site_id',selectedSiteId);for(const key of ['start_date','end_date','month','year']){const value=searchParams.get(key);if(value)notificationParams.set(key,value);}}
  const notificationScope=scopedDashboard?notificationParams.toString():'global';
  const notificationScopeRef=React.useRef(notificationScope);
  notificationScopeRef.current=notificationScope;
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { clear } = useAuth();
  const user = useSessionUser();
  const canViewAlerts = canVisitPage(user.role, "/alerts");

  const [notificationOpen, setNotificationOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [allAlerts, setAllAlerts] = React.useState<AlertItem[]>([]);
  const [visibleCount, setVisibleCount] = React.useState(6);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [storedActiveAlertCount, setActiveAlertCount] = React.useState(0);
  const [loadingAlerts, setLoadingAlerts] = React.useState(false);
  const [loadedAlertScope,setLoadedAlertScope]=React.useState('');
  const alertRequest=React.useRef(0);
  const activeAlertCount=loadedAlertScope===notificationScope?storedActiveAlertCount:0;
  const displayedAlerts=loadedAlertScope===notificationScope?alerts:[];

  // Fetch active alerts count on mount and on open
  const fetchAlerts = React.useCallback(async () => {
    if (!canViewAlerts) return;
    const request=++alertRequest.current;
    setLoadingAlerts(true);
    setLoadingMore(false);
    setAllAlerts([]);setAlerts([]);setActiveAlertCount(0);
    try {
      if(scopedDashboard){
        const summary=await apiClient.get<DashboardSummaryResponse>(`/v1/dashboard/summary?${notificationScope}`);
        if(request!==alertRequest.current)return;
        const rows=summary.alerts.map((alert,index)=>({...alert,id:alert.id||`${selectedSiteId}-${index}`}));
        setAllAlerts(rows);setAlerts(rows.slice(0,6));setVisibleCount(6);setActiveAlertCount(summary.alertActiveCount??rows.filter(row=>row.status!=='acknowledged').length);setLoadedAlertScope(notificationScope);
        return;
      }
      const [listRes, summaryRes] = await Promise.all([
        apiClient.get<{ rows: AlertItem[] }>("/v1/operations/alerts").catch(() => ({ rows: [] })),
        apiClient.get<{ label: string; value: number }[]>("/v1/operations/alerts/summary").catch(() => []),
      ]);
      if(request!==alertRequest.current)return;

      const rows = listRes.rows || [];
      setAllAlerts(rows);
      setAlerts(rows.slice(0, 6));
      setVisibleCount(6);
      setLoadedAlertScope(notificationScope);
      const activeItem = summaryRes.find((s) => s.label.includes("active") || s.label.includes("ใช้งาน"));
      setActiveAlertCount(Number(activeItem?.value ?? rows.filter((r) => r.status !== "acknowledged").length));
    } catch {
      // ignore
    } finally {
      if(request===alertRequest.current){setLoadingAlerts(false);setLoadedAlertScope(notificationScope);}
    }
  }, [canViewAlerts,notificationScope,scopedDashboard,selectedSiteId]);

  const handleMarkAllAsRead = async () => {
    if(scopedDashboard)return;
    try {
      await acknowledgeAlertScope(apiClient,{scope:notificationScope,generation:alertRequest.current},()=>({scope:notificationScopeRef.current,generation:alertRequest.current}),()=>{
      setActiveAlertCount(0);
      setAllAlerts((prev) => prev.map((a) => ({ ...a, status: "acknowledged" })));
      setAlerts((prev) => prev.map((a) => ({ ...a, status: "acknowledged" })));
      void fetchAlerts();
      });
    } catch {
      // ignore
    }
  };

  const handleNotificationScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 25) {
      if (visibleCount < allAlerts.length && !loadingMore) {
        const request=alertRequest.current;
        setLoadingMore(true);
        setTimeout(() => {
          if(request!==alertRequest.current)return;
          setVisibleCount((prev) => {
            const next = Math.min(prev + 6, allAlerts.length);
            setAlerts(allAlerts.slice(0, next));
            return next;
          });
          setLoadingMore(false);
        }, 250);
      }
    }
  };

  React.useEffect(() => {
    fetchAlerts();
    return()=>{alertRequest.current++;};
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
    if (path.startsWith("/records/")) return locale === "th" ? "รายละเอียดรายการ" : "Record details";
    switch (path) {
      case "/":
        return locale === "th" ? "หน้าแรก" : "Home";
      case "/system":
        return t("navigation.system");
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
      case "/production":
        return locale === "th" ? "การผลิตไฟฟ้า" : "Production";
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
      case "/settings/company":
        return t("navigation.companyAndBanking");
      case "/settings/system":
        return t("navigation.systemDefaults");
      case "/settings/meter-presets":
        return locale === "th" ? "ค่าจากมิเตอร์" : "Meter values";
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
                {BRAND_NAME}
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
        <BrandMark className="size-7.5" />
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-[13px] leading-tight text-foreground truncate">
            {BRAND_NAME}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[140px]">
            {pageTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Notification Popover (Responsive: Full-screen Sheet on Mobile, Popover on Desktop) */}
        {canViewAlerts && <ResponsivePopover
          open={notificationOpen}
          onOpenChange={setNotificationOpen}
          title={t("notifications.header")}
          sheetHeaderClassName="sr-only"
          showCloseButton={false}
          popoverClassName="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border border-border p-0 shadow-lg ring-0"
          sheetClassName="h-full max-h-screen inset-0 rounded-none w-full p-0 flex flex-col gap-0 bg-background overflow-hidden"
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("navigation.alerts")}
              className="relative size-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <Bell className="size-4" />
              {activeAlertCount > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-card animate-pulse" />
              )}
            </Button>
          }
        >
          {/* Notification header with compact actions */}
          <div className="flex h-12 shrink-0 items-center bg-card px-3">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-xs font-bold sm:font-semibold text-foreground">
                  {t("notifications.header")}
                </span>
                {activeAlertCount > 0 ? (
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px] font-medium rounded-full bg-destructive/15 text-destructive"
                  >
                    {t("notifications.badge", { count: activeAlertCount })}
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px] font-medium rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  >
                    {t("notifications.allClear")}
                  </Badge>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" type="button" onClick={handleMarkAllAsRead} disabled={scopedDashboard || activeAlertCount === 0} className="size-8 text-primary hover:bg-primary/10" aria-label={t("notifications.markAllAsRead")} title={t("notifications.markAllAsRead")}><CheckCheck aria-hidden="true" className="size-4" /></Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setNotificationOpen(false)}
                className="size-8 rounded-full p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label={locale === "th" ? "ปิด" : "Close"}
              >
                <X className="size-4" />
              </Button>
            </div>

            </div>
          </div>

          <div
            onScroll={handleNotificationScroll}
            className="divide-y divide-border/60 flex-1 md:max-h-72 overflow-y-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {loadingAlerts || loadedAlertScope !== notificationScope ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : displayedAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-500/70 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t("notifications.noAlerts")}
                </p>
              </div>
            ) : (
              <>
                {displayedAlerts.map((alert) => (
                  <Link
                    key={alert.id}
                    href="/alerts"
                    onClick={() => setNotificationOpen(false)}
                    className="flex items-start gap-2.5 p-3.5 sm:p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="grid size-6 shrink-0 place-items-center rounded-md bg-destructive/15 text-destructive mt-0.5">
                      <AlertTriangle className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <strong className="truncate text-xs font-semibold text-foreground leading-tight">
                          {alert.title}
                        </strong>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {alert.status === "acknowledged"
                            ? t("notifications.acknowledged")
                            : alert.severity || "alarm"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 leading-tight">
                        {alert.detail}
                      </p>
                    </div>
                  </Link>
                ))}
                {loadingMore && (
                  <div className="flex items-center justify-center p-2.5 text-xs text-muted-foreground gap-1.5 bg-muted/10">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    <span>{t("common.loading")}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </ResponsivePopover>}

        {/* Profile Popover with Language & Theme Switches (Desktop) */}
        <div className="hidden md:block">
          <Popover open={profileOpen} onOpenChange={setProfileOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm"
                type="button"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("profile.userMenu")}
              >
                <Avatar className="size-8.5 border border-border">
                  <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col text-left">
                  <span className="text-xs font-semibold text-foreground leading-tight truncate max-w-[140px]">
                    {user?.displayName || "Admin User"}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight truncate max-w-[140px]">
                    {roleLabel}
                  </span>
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-72 gap-0 overflow-hidden rounded-xl border border-border p-0 shadow-xl ring-0"
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

              {/* User Account Navigation Links */}
              <div className="p-1.5 border-b border-border/70 space-y-0.5 bg-card">
                <Link
                  href="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 min-h-10 py-2 rounded-lg text-sm font-normal text-foreground hover:bg-muted/80 transition-colors"
                >
                  <Settings2 className="size-3.5 text-muted-foreground" />
                  <span>{locale === "en" ? "Settings" : "การตั้งค่า"}</span>
                </Link>
                <Link
                  href="/settings/account"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 min-h-10 py-2 rounded-lg text-sm font-normal text-foreground hover:bg-muted/80 transition-colors"
                >
                  <User className="size-3.5 text-muted-foreground" />
                  <span>{locale === "en" ? "Account Settings" : "การตั้งค่าบัญชี"}</span>
                </Link>
                <Link
                  href="/settings/security"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 min-h-10 py-2 rounded-lg text-sm font-normal text-foreground hover:bg-muted/80 transition-colors"
                >
                  <Shield className="size-3.5 text-muted-foreground" />
                  <span>{locale === "en" ? "Security & Password" : "ความปลอดภัยและรหัสผ่าน"}</span>
                </Link>
              </div>

              <ProfilePreferences locale={locale} theme={theme??"system"} onLocaleChange={handleLanguageChange} onThemeChange={handleThemeChange}/>

              {/* Logout Button */}
              <div className="p-2 pb-2.5">
                <Button variant="ghost" size="sm"
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3 min-h-10 py-2 rounded-lg text-sm font-normal text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border border-transparent hover:border-destructive/20"
                >
                  <LogOut className="size-4" />
                  <span>{t("auth.logout")}</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Mobile Hamburger Trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          className="flex md:hidden size-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
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
