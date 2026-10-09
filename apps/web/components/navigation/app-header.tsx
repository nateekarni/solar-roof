"use client";
import {BrandMark, BRAND_NAME} from "../brand/brand-mark";
import {ProfilePreferences} from "./profile-preferences";
import {NotificationBell} from './notification-bell';
import {useSiteSelection} from '../../features/dashboard/site-selection-provider';
import { useSessionUser } from "../../providers/session-user-provider";

import {
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
import { Separator } from "../../components/ui/separator";
import { SidebarTrigger } from "../../components/ui/sidebar";
import { apiClient } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import { useLocale, useSetLocale, useT } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";

export function AppHeader() {
  const pathname = usePathname();
  const {selectedSiteId}=useSiteSelection();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { clear } = useAuth();
  const user = useSessionUser();

  const [profileOpen, setProfileOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
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
        return user.role === "school_user" ? (locale === "th" ? "เอกสาร" : "Documents") : t("navigation.contracts");
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
        <NotificationBell siteId={pathname==='/'?selectedSiteId||undefined:undefined}/>

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
