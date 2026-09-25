"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Sun } from "lucide-react";
import * as React from "react";
import {
  Sidebar,
  SidebarContent,
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
  useSidebar,
} from "../../components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useT } from "../../providers/locale-provider";
import { NAV_ITEMS } from "./nav-config";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const currentAction = searchParams?.get("action");

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-3 py-2.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2 group-data-[collapsible=icon]:justify-center">
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

      <SidebarContent className="px-2 group-data-[collapsible=icon]:px-0">
        <SidebarGroup className="py-1 group-data-[collapsible=icon]:p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 group-data-[collapsible=icon]:space-y-1.5 group-data-[collapsible=icon]:items-center">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const hasSubItems = Boolean(item.subItems && item.subItems.length > 0);
                const hasActiveChild = Boolean(
                  hasSubItems && item.subItems?.some((sub) => pathname === sub.href)
                );

                if (hasSubItems && item.subItems) {
                  // Collapsed mode: Use DropdownMenu flyout
                  if (isCollapsed) {
                    return (
                      <SidebarMenuItem key={item.key}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                              tooltip={t(item.labelKey)}
                              isActive={hasActiveChild}
                              className="w-full cursor-pointer"
                            >
                              <Icon className="size-4 shrink-0" />
                              <span className="truncate">{t(item.labelKey)}</span>
                            </SidebarMenuButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            side="right"
                            align="start"
                            sideOffset={8}
                            className="min-w-44 p-1.5 shadow-xl rounded-xl border border-border"
                          >
                            <div className="px-2 py-1 text-xs font-bold text-muted-foreground border-b border-border/50 mb-1">
                              {t(item.labelKey)}
                            </div>
                            {item.subItems.map((sub) => {
                              const isSubActive = pathname === sub.href;
                              return (
                                <DropdownMenuItem key={sub.href} asChild>
                                  <Link
                                    href={sub.href}
                                    className={`flex items-center w-full px-2.5 py-2 text-xs rounded-md cursor-pointer transition-colors ${
                                      isSubActive
                                        ? "bg-[#EAB308] text-[#0F172A] font-semibold dark:bg-amber-500/20 dark:text-amber-300"
                                        : "text-foreground hover:bg-muted"
                                    }`}
                                  >
                                    <span className="truncate">{t(sub.labelKey)}</span>
                                  </Link>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </SidebarMenuItem>
                    );
                  }

                  // Expanded mode: Use standard Collapsible accordion
                  return (
                    <Collapsible
                      key={item.key}
                      asChild
                      defaultOpen={hasActiveChild}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={t(item.labelKey)}
                            isActive={false}
                            className="w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/85 font-medium"
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{t(item.labelKey)}</span>
                            <ChevronDown className="ml-auto size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden text-sidebar-foreground/60" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <SidebarMenuSub className="my-0.5 space-y-0.5 mr-0 pr-0">
                            {item.subItems.map((sub) => {
                              const isSubActive = pathname === sub.href;

                              return (
                                <SidebarMenuSubItem key={sub.href}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={isSubActive}
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

                // Direct links without subItems (Dashboard, Schools, Sites, Alerts, etc.)
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={t(item.labelKey)}
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
      <SidebarRail />
    </Sidebar>
  );
}
