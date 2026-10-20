"use client";

import { LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState } from "react";
import { BrandMark, BRAND_NAME } from "../../../components/brand/brand-mark";
import { ProfilePreferences } from "../../../components/navigation/profile-preferences";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { Button } from "../../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { apiClient } from "../../../lib/api-client";
import { useLocale, useSetLocale, useT } from "../../../providers/locale-provider";
import { useAuth } from "../../../stores/auth-store";
import { CustomerNavigationLinks } from "./customer-bottom-nav";
import { CustomerNotificationCenter } from "./customer-notification-center";

export function CustomerTopNav({ pathname }: { pathname: string }) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { user, clear } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const initial =
    user?.displayName?.trim().charAt(0).toLocaleUpperCase(locale) ||
    user?.email?.charAt(0).toLocaleUpperCase(locale) ||
    "C";

  async function signOut() {
    setSigningOut(true);
    try {
      await apiClient.post("/v1/auth/logout");
    } catch {
      // Clear the local session even if the server is unavailable.
    }
    clear();
    window.location.assign("/login");
  }

  function changeTheme(value: "light" | "dark" | "system") {
    setTheme(value);
    apiClient.put("/v1/me/preferences", { preferredTheme: value }).catch(() => {});
  }

  return (
    <header className="customer-top-nav">
      <div className="customer-container flex min-h-18 items-center justify-between gap-3 py-2">
        <Link
          href="/"
          aria-label={t("customerPortal.shell.home")}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 font-semibold"
        >
          <BrandMark className="size-8" />
          <span className="hidden sm:inline">{BRAND_NAME}</span>
        </Link>
        <nav
          aria-label={t("customerPortal.shell.desktopNavigation")}
          className="hidden items-center gap-1 md:flex"
        >
          <CustomerNavigationLinks pathname={pathname} />
        </nav>
        <div className="flex items-center gap-2">
          <CustomerNotificationCenter />
          <Popover open={profileOpen} onOpenChange={setProfileOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("customerPortal.shell.profileMenu")}
                className="customer-profile-trigger h-11! w-11! rounded-full p-0"
              >
                <Avatar className="size-10">
                  {user?.avatarData && <AvatarImage src={user.avatarData} alt="" />}
                  <AvatarFallback className="bg-primary font-bold text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="customer-portal customer-profile-menu w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border border-border p-0 shadow-xl ring-0 [&_button]:min-h-11 [&_button]:min-w-11"
            >
              <div className="flex items-center gap-3 border-b border-border bg-muted/30 p-3.5">
                <Avatar className="size-10 border border-border">
                  {user?.avatarData && <AvatarImage src={user.avatarData} alt="" />}
                  <AvatarFallback className="bg-primary font-bold text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {user?.displayName || t("customerPortal.shell.account")}
                  </p>
                  {user?.email && (
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </div>

              <ProfilePreferences
                locale={locale}
                theme={theme ?? "system"}
                onLocaleChange={(next) => void setLocale(next)}
                onThemeChange={changeTheme}
              />

              <div className="p-2 pb-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={signingOut}
                  onClick={() => void signOut()}
                  className="min-h-10 w-full justify-start gap-2.5 rounded-lg border border-transparent px-3 text-destructive hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut aria-hidden="true" className="size-5" />
                  <span>{t("customerPortal.shell.logout")}</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
