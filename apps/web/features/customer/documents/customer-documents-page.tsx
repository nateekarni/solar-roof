"use client";
import * as React from "react";
import type { Capabilities, OperationQuery } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { useLocale } from "../../../providers/locale-provider";
import { CustomerDocumentFilters } from "./customer-document-filters";
import { CustomerFinancialRecordCard } from "./customer-financial-record-card";
import {
  appendCustomerDocuments,
  customerDocumentsQuery,
  loadCustomerDocuments,
  loadCustomerDocumentCapabilities,
  patchCustomerDocumentsQuery,
  type CustomerDocumentsData,
} from "./customer-documents-model";
import { Button } from "@/components/ui/button";

export function CustomerDocumentsPage({
  initial,
  initialQuery,
  locale: initialLocale,
  capabilities,
}: {
  initial: CustomerDocumentsData | null;
  initialQuery: string;
  locale: Locale;
  capabilities: Capabilities | null;
}) {
  const locale = useLocale(initialLocale);
  const t = createTranslator(locale);
  const panelId = React.useId();
  const [query, setQuery] = React.useState(() =>
    customerDocumentsQuery(new URLSearchParams(initialQuery)),
  );
  const [data, setData] = React.useState(initial),
    [loading, setLoading] = React.useState(false),
    [error, setError] = React.useState(initial === null);
  const request = React.useRef<AbortController | null>(null),
    revision = React.useRef(0);
  const lastRequest = React.useRef({ query, append: false });
  const [permissions, setPermissions] = React.useState(capabilities);
  const [permissionsError, setPermissionsError] = React.useState(
    capabilities === null,
  );
  const [permissionsLoading, setPermissionsLoading] = React.useState(false);
  const permissionRequest = React.useRef<AbortController | null>(null);
  const permissionRevision = React.useRef(0);
  React.useEffect(() => {
    permissionRequest.current?.abort();
    permissionRevision.current++;
    setPermissions(capabilities);
    setPermissionsError(capabilities === null);
    setPermissionsLoading(false);
    return () => {
      permissionRequest.current?.abort();
    };
  }, [capabilities]);
  async function retryPermissions() {
    permissionRequest.current?.abort();
    const controller = new AbortController();
    permissionRequest.current = controller;
    const current = ++permissionRevision.current;
    setPermissions(null);
    setPermissionsError(false);
    setPermissionsLoading(true);
    try {
      const next = await loadCustomerDocumentCapabilities(controller.signal);
      if (current === permissionRevision.current && !controller.signal.aborted)
        setPermissions(next);
    } catch {
      if (current === permissionRevision.current && !controller.signal.aborted)
        setPermissionsError(true);
    } finally {
      if (current === permissionRevision.current && !controller.signal.aborted)
        setPermissionsLoading(false);
    }
  }
  React.useEffect(() => {
    request.current?.abort();
    revision.current++;
    const next = customerDocumentsQuery(new URLSearchParams(initialQuery));
    setQuery(next);
    setData(initial);
    setError(initial === null);
    setLoading(false);
    lastRequest.current = { query: next, append: false };
  }, [initial, initialQuery]);
  const read = React.useCallback(
    async (next: URLSearchParams, append = false) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const current = ++revision.current;
      lastRequest.current = { query: next, append };
      setLoading(true);
      setError(false);
      try {
        const response = await loadCustomerDocuments(next, controller.signal);
        if (current === revision.current && !controller.signal.aborted) {
          setData((previous) =>
            append && previous
              ? appendCustomerDocuments(previous, response)
              : response,
          );
        }
      } catch {
        if (current === revision.current && !controller.signal.aborted)
          setError(true);
      } finally {
        if (current === revision.current && !controller.signal.aborted)
          setLoading(false);
      }
    },
    [],
  );
  React.useEffect(() => {
    const back = () => {
      const next = customerDocumentsQuery(
        new URLSearchParams(window.location.search),
      );
      setQuery(next);
      setData(null);
      void read(next);
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      request.current?.abort();
    };
  }, [read]);
  function update(patch: Partial<OperationQuery>) {
    const next = patchCustomerDocumentsQuery(query, patch);
    setQuery(next);
    setData(null);
    window.history.pushState(
      null,
      "",
      `/billing${next.size ? "?" + next : ""}`,
    );
    void read(next);
  }
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("customerPortal.billing.title")}
        </h1>
      </header>
      <CustomerDocumentFilters
        query={query}
        locale={locale}
        facets={data?.facets}
        panelId={panelId}
        onChange={update}
      />
      <section
        id={panelId}
        aria-label={t("customerPortal.billing.title")}
        aria-busy={loading || permissionsLoading}
        className="min-w-0 space-y-4"
      >
        {permissionsError && (
          <div role="alert" className="rounded-2xl border border-border p-5">
            <p>{t("customerPortal.billing.actionsUnavailable")}</p>
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void retryPermissions()}
            >
              {t("customerPortal.billing.retryActions")}
            </Button>
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-2xl border border-border p-5">
            <p>{t("customerPortal.billing.unavailable")}</p>
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() =>
                void read(lastRequest.current.query, lastRequest.current.append)
              }
            >
              {t("customerPortal.common.retry")}
            </Button>
          </div>
        )}
        {(loading || permissionsLoading) && (
          <p role="status">{t("customerPortal.common.loading")}</p>
        )}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {data?.rows.map((record) => (
            <CustomerFinancialRecordCard
              key={record.id}
              record={record}
              capabilities={permissions ?? { actions: [], unavailable: {} }}
              locale={locale}
            />
          ))}
        </div>
        {data?.rows.length === 0 && !loading && !error && (
          <p className="rounded-2xl border border-border p-6 text-muted-foreground">
            {t("customerPortal.billing.empty")}
          </p>
        )}
        {data?.page.hasMore && data.page.nextCursor && (
          <Button
            type="button"
            disabled={loading}
            variant="outline"
            className="min-h-11 w-full"
            onClick={() =>
              void read(
                patchCustomerDocumentsQuery(query, {
                  cursor: data.page.nextCursor!,
                }),
                true,
              )
            }
          >
            {t("customerPortal.billing.loadMore")}
          </Button>
        )}
      </section>
    </div>
  );
}
