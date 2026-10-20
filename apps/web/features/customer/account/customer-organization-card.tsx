"use client";
import { useEffect, useState } from "react";
import { useT } from "../../../providers/locale-provider";
import { apiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Building2 } from "lucide-react";
import { loadOrganizationRows } from "../../organization/organization-document-loader";
import type { OrganizationDocument } from "../../organization/organization-document-model";
import { customerAccountCard } from "./customer-account-presentation";

export interface CustomerOrganization extends OrganizationDocument {
  companyName?: string;
  customerName?: string;
  taxId?: string;
  taxAddress?: string;
  taxBranch?: string;
}

export function CustomerOrganizationCard({
  rows: initial,
}: { rows?: CustomerOrganization[] } = {}) {
  const t = useT();
  const [rows, setRows] = useState(initial),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (initial) return;
    let active = true;
    setError(false);
    loadOrganizationRows<CustomerOrganization>("contracts", apiClient.get)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [initial, revision]);
  return (
    <section
      className={customerAccountCard}
      aria-labelledby="customer-organization-title"
    >
      <div data-customer-card-heading="true" className="space-y-1">
        <h2 id="customer-organization-title" className="text-lg font-semibold">
          {t("customerPortal.account.organization")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("customerPortal.account.readOnly")}
        </p>
      </div>
      {error && (
        <div role="alert" className="space-y-3">
          <p>{t("customerPortal.account.organizationUnavailable")}</p>
          <Button
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("customerPortal.common.retry")}
          </Button>
        </div>
      )}
      {!rows && !error && (
        <p role="status">{t("customerPortal.common.loading")}</p>
      )}
      {rows?.length === 0 && (
        <div
          role="status"
          data-customer-empty-state="true"
          className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-muted-foreground"
        >
          <Building2 className="size-7" aria-hidden="true" />
          <p>{t("customerPortal.common.noData")}</p>
        </div>
      )}
      {rows?.map((row) => (
        <dl
          key={row.id}
          className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2"
        >
          {[
            ["organizationName", row.companyName || row.customerName],
            ["site", row.siteName],
            ["taxId", row.taxId],
            ["taxBranch", row.taxBranch],
            ["address", row.taxAddress],
          ].map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-muted-foreground">
                {t(`customerPortal.account.${key}`)}
              </dt>
              <dd className="mt-1 break-words font-medium">
                {value || t("customerPortal.common.unavailable")}
              </dd>
            </div>
          ))}
        </dl>
      ))}
    </section>
  );
}
