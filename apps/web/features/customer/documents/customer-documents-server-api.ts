import type { Capabilities } from "@solar/api-contracts";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getApiBaseUrl, serverFetch } from "../../../lib/server-fetch";
import {
  customerDocumentsQuery,
  type CustomerDocumentsData,
} from "./customer-documents-model";

export async function loadCustomerDocumentsServer(
  query: URLSearchParams,
): Promise<{
  initial: CustomerDocumentsData | null;
  capabilities: Capabilities | null;
}> {
  const base = getApiBaseUrl();
  async function read<T>(endpoint: string): Promise<T | null> {
    try {
      const response = await serverFetch(`${base}${endpoint}`, {
        cache: "no-store",
      });
      return response.ok ? ((await response.json()) as T) : null;
    } catch (error) {
      if (isRedirectError(error)) throw error;
      return null;
    }
  }
  const [initial, capabilities] = await Promise.all([
    read<CustomerDocumentsData>(
      `/v1/operations/billing?${customerDocumentsQuery(query)}`,
    ),
    read<Capabilities>("/v1/auth/capabilities"),
  ]);
  return { initial, capabilities };
}
