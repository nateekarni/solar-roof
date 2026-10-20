import type {
  CustomerPortalHomeResponse,
  CustomerPortalRange,
} from "@solar/api-contracts";
import { apiClient } from "../../../lib/api-client";

export type CustomerHomeState =
  | { status: "ready"; data: CustomerPortalHomeResponse }
  | { status: "unavailable" };
export const customerHomeEndpoint = (range: CustomerPortalRange) =>
  `/v1/customer/portal/home?range=${range}`;

export async function readCustomerHome(
  response: Response,
): Promise<CustomerHomeState> {
  if (!response.ok) return { status: "unavailable" };
  try {
    return {
      status: "ready",
      data: (await response.json()) as CustomerPortalHomeResponse,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function loadCustomerHome(
  range: CustomerPortalRange,
  signal?: AbortSignal,
): Promise<CustomerHomeState> {
  try {
    return {
      status: "ready",
      data: await apiClient.get<CustomerPortalHomeResponse>(
        customerHomeEndpoint(range),
        {
          credentials: "include",
          cache: "no-store",
          ...(signal && { signal }),
        },
      ),
    };
  } catch {
    return { status: "unavailable" };
  }
}
