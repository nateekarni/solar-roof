"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Sun } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "../../components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { useT } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";
import { NAV_ITEMS } from "./nav-config";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const { user } = useAuth();

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

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <Sun className="size-4.5" />
          </div>
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-[15px] leading-tight text-sidebar-foreground">
              Solar Platform
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const hasSubItems = Boolean(item.subItems && item.subItems.length > 0);
                const isParentActive = Boolean(
                  (item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)))) ||
                  (hasSubItems &&
                    item.subItems?.some(
                      (sub) =>
                        pathname === sub.href ||
                        (sub.href !== "/settings" && pathname.startsWith(sub.href + "/"))
                    ))
                );

                if (hasSubItems && item.subItems) {
                  return (
                    <Collapsible
                      key={item.key}
                      asChild
                      defaultOpen={isParentActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={t(item.labelKey)}
                            isActive={isParentActive}
                            className="w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold"
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{t(item.labelKey)}</span>
                            <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden text-sidebar-foreground/60" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <SidebarMenuSub className="my-0.5 space-y-0.5">
                            {item.subItems.map((sub) => {
                              const isSubActive = Boolean(
                                pathname === sub.href ||
                                (sub.href !== "/settings" && pathname.startsWith(sub.href + "/"))
                              );

                              return (
                                <SidebarMenuSubItem key={sub.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isSubActive}
                                    className={
                                      isSubActive
                                        ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/75"
                                    }
                                  >
                                    <Link href={sub.href}>
                                      <span className="truncate">{t(sub.labelKey)}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                // Direct links without subItems (Dashboard, Schools, Sites, Reports, etc.)
                const isActive = Boolean(
                  item.href &&
                  (pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href)))
                );
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={t(item.labelKey)}
                      className={
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-xs hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                      }
                    >
                      <Link href={item.href || "#"} className="flex items-center gap-2.5">
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg">
          <Avatar className="size-8.5 border border-sidebar-border">
            <AvatarFallback className="bg-primary/20 text-sidebar-primary font-bold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-semibold text-sidebar-foreground">
              {user?.displayName || "Admin"}
            </p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">
              {roleLabel}
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
