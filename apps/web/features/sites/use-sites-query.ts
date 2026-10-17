"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-client";

export interface SiteListItem {
  id: string;
  name: string;
  externalSiteId?: string | null;
  capacityMwp: number;
  status: string;
  customerId: string;
  customerName?: string;
  customerCode?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface GatewayListItem {
  id: string;
  siteId: string;
  name: string;
  protocol: string;
  endpoint: string;
  externalGatewayId?: string | null;
  status?: string;
}

export interface SiteCustomerUserItem {
  id: string;
  email: string;
  displayName: string;
  status: "invited" | "active" | "disabled";
  avatarData?: string | null;
  invitedAt?: string | null;
  activatedAt?: string | null;
  lastLoginAt?: string | null;
  revision: number;
}

export const siteQueryKeys = {
  all: ["sites"] as const,
  lists: () => [...siteQueryKeys.all, "list"] as const,
  detail: (id: string) => [...siteQueryKeys.all, "detail", id] as const,
  gateways: (siteId?: string) => ["gateways", siteId ?? "all"] as const,
  customerUsers: (siteId: string) => [...siteQueryKeys.detail(siteId), "customer-users"] as const,
};

export function useSiteList() {
  return useQuery({
    queryKey: siteQueryKeys.lists(),
    queryFn: () => apiClient.get<SiteListItem[]>("/v1/sites"),
  });
}

export function useGateways(siteId?: string) {
  return useQuery({
    queryKey: siteQueryKeys.gateways(siteId),
    queryFn: () =>
      apiClient.get<GatewayListItem[]>(
        siteId ? `/v1/sites/${siteId}/gateways` : "/v1/gateways"
      ),
  });
}

export function useCustomerUsers(siteId: string, enabled = true) {
  return useQuery({
    queryKey: siteQueryKeys.customerUsers(siteId),
    queryFn: () =>
      apiClient.get<{ users: SiteCustomerUserItem[] }>(
        `/v1/sites/${siteId}/customer-users`
      ),
    enabled: Boolean(siteId) && enabled,
  });
}

export function useInvalidateSites() {
  const queryClient = useQueryClient();
  return {
    invalidateSites: () => queryClient.invalidateQueries({ queryKey: siteQueryKeys.all }),
    invalidateCustomerUsers: (siteId: string) =>
      queryClient.invalidateQueries({ queryKey: siteQueryKeys.customerUsers(siteId) }),
  };
}
