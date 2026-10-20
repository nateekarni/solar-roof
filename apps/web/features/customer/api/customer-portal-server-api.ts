import type { CustomerPortalRange } from "@solar/api-contracts";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getApiBaseUrl, serverFetch } from "../../../lib/server-fetch";
import {
  customerHomeEndpoint,
  readCustomerHome,
  type CustomerHomeState,
} from "./customer-portal-api";

export async function loadCustomerHomeServer(
  range: CustomerPortalRange = "7d",
): Promise<CustomerHomeState> {
  try {
    return await readCustomerHome(
      await serverFetch(`${getApiBaseUrl()}${customerHomeEndpoint(range)}`, {
        cache: "no-store",
      }),
    );
  } catch (error) {
    // serverFetch owns the session refresh/login redirect; never normalize it as an API failure.
    if (isRedirectError(error)) throw error;
    return { status: "unavailable" };
  }
}
