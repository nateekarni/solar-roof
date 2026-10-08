"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { useLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { formatAppDate } from "../../lib/date-format";
import {
  DocumentPreviewModal,
  type DocumentPreviewData,
} from "../shared/document-preview-modal";
import {
  documentsForContract,
  filterDocuments,
  type OrganizationDocument,
} from "./organization-document-model";
import { organizationDocumentStatus } from './organization-document-status';
import { formatOrganizationMonth } from "./organization-month-format";
import { loadOrganizationRows } from "./organization-document-loader";
interface Contract extends OrganizationDocument {
  contractNumber?: string;
  startDate?: string;
  endDate?: string;
  schoolName?: string;
  companyName?: string;
  taxId?: string;
  taxAddress?: string;
}
interface Document extends OrganizationDocument {
  invoiceId?: string;
  receiptId?: string;
  documentNumber?: string;
}
export function OrganizationDocuments() {
  const locale = useLocale();
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  const [data, setData] = useState<{
    contracts: Contract[];
    invoices: Document[];
    receipts: Document[];
  } | null>(null);
  const [error, setError] = useState<"access" | "load" | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<DocumentPreviewData | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    Promise.all([
      loadOrganizationRows<Contract>("contracts", apiClient.get),
      loadOrganizationRows<Document>("billing", apiClient.get),
      loadOrganizationRows<Document>("receipts", apiClient.get),
    ])
      .then(([contracts, invoices, receipts]) => {
        if (active) setData({ contracts, invoices, receipts });
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            (err as { status?: number }).status === 401 ||
              (err as { status?: number }).status === 403
              ? "access"
              : "load",
          );
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const months = Array.from(
    new Set(
      [...(data?.invoices ?? []), ...(data?.receipts ?? [])]
        .map((row) => (row.period || row.issueDate || "").slice(0, 7))
        .filter((value) => /^\d{4}-\d{2}$/.test(value)),
    ),
  )
    .sort()
    .reverse();
  const monthLabel = (value: string) => formatOrganizationMonth(value, locale);
  const statuses = Array.from(
    new Set(
      [...(data?.invoices ?? []), ...(data?.receipts ?? [])]
        .flatMap((row) => [row.status, row.paymentStatus])
        .filter((value): value is string => !!value),
    ),
  );
    const label = (value?: string) => organizationDocumentStatus(value, locale);
const documents = (rows: Document[]) =>
    filterDocuments(documentsForContract(rows, selected), month, status);
  const renderList = (rows: Document[], type: "invoice" | "receipt") => (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">
        {type === "invoice"
          ? text("ใบแจ้งหนี้", "Invoices")
          : text("ใบเสร็จรับเงิน", "Receipts")}
      </h2>
      {rows.length === 0 ? (
        <p className="py-5 text-sm text-muted-foreground">
          {text("ไม่มีเอกสารตรงกับตัวกรอง", "No documents match these filters")}
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div>
                <p className="font-medium">
                  {row.documentNumber ||
                    row.invoiceNumber ||
                    row.receiptNumber ||
                    text("ยังไม่ออกเลขที่เอกสาร", "Document number unavailable")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.siteName ||
                    text("ยังไม่มีข้อมูลไซต์งาน", "Site unavailable")}{" "}
                  ·{" "}
                  {(row.period ? monthLabel(row.period) : null) ||
                    (row.issueDate
                      ? formatAppDate(row.issueDate, locale)
                      : "—")}{" "}
                  · {label(row.paymentStatus || row.status)}
                </p>
              </div>
              <p>
                {row.amount == null || String(row.amount).trim() === ""
                  ? "—"
                  : Number(row.amount).toLocaleString(locale, {
                      maximumFractionDigits: 2,
                    })}{" "}
                THB
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 text-foreground"
                  onClick={() =>
                    setPreview({
                      type,
                      documentId:
                        (type === "invoice"
                          ? row.invoiceId
                          : row.receiptId || row.id) || "",
                      documentNumber:
                        row.documentNumber ||
                        row.invoiceNumber ||
                        row.receiptNumber ||
                        "",
                      siteId: row.siteId || "",
                    })
                  }
                >
                  {text("เปิดเอกสาร", "Preview document")}
                </Button>
                <Link
                  className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
                  href={`/records/${type === "invoice" ? "billing" : "receipts"}/${encodeURIComponent(row.id)}`}
                >
                  {type === "invoice"
                    ? text("รายละเอียด / การชำระเงิน", "Details / Payment")
                    : text("รายละเอียด", "Details")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <div className="content w-full min-w-0 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">
          {text("เอกสาร", "Documents")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {text(
            "เลือกสัญญาเพื่อดูใบแจ้งหนี้และใบเสร็จที่เชื่อมโยง",
            "Select a contract to view its linked invoices and receipts",
          )}
        </p>
      </header>
      {error ? (
        <div role="alert">
          <p>
            {error === "access"
              ? text(
                  "ไม่มีสิทธิ์เข้าถึงเอกสาร กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาต",
                  "Document access denied. Sign in with an authorized account.",
                )
              : text("โหลดเอกสารไม่สำเร็จ", "Unable to load documents")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 text-foreground"
            onClick={() => setRetry((value) => value + 1)}
          >
            {text("ลองอีกครั้ง", "Retry")}
          </Button>
        </div>
      ) : !data ? (
        <p role="status">{text("กำลังโหลดเอกสาร", "Loading documents")}</p>
      ) : (
        <>
          <section
            aria-label={text("เลือกสัญญา", "Select contract")}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {data.contracts.map((contract) => (
              <button
                key={contract.id}
                aria-pressed={selected === contract.id}
                onClick={() => setSelected(contract.id)}
                className={`min-w-0 rounded-xl border bg-card p-4 text-left ${selected === contract.id ? "ring-2 ring-primary" : ""}`}
              >
                <p className="font-semibold break-all">
                  {contract.contractNumber || text("ยังไม่ออกเลขที่สัญญา", "Contract number unavailable")}
                </p>
                <p className="mt-1 text-sm">
                  {contract.siteName || "—"} · {label(contract.status)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {contract.startDate
                    ? formatAppDate(contract.startDate, locale)
                    : "—"}{" "}
                  –{" "}
                  {contract.endDate
                    ? formatAppDate(contract.endDate, locale)
                    : text("ไม่ระบุวันสิ้นสุด", "End date unavailable")}
                </p>
              </button>
            ))}
            <button
              aria-pressed={selected === null}
              onClick={() => setSelected(null)}
              className={`rounded-xl border bg-card p-4 text-left ${selected === null ? "ring-2 ring-primary" : ""}`}
            >
              <p className="font-semibold">
                {text(
                  "เอกสารที่ยังไม่เชื่อมโยงสัญญา",
                  "Documents without contract linkage",
                )}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {text(
                  "ไม่สามารถระบุรุ่นสัญญาของเอกสารเหล่านี้ได้",
                  "The contract version for these records is unavailable.",
                )}
              </p>
            </button>
          </section>
          <div className="flex flex-wrap gap-4">
            <label className="space-y-1 text-sm">
              <span className="block">{text("เดือน", "Month")}</span>
              <select
                className="min-h-11 rounded-md border bg-card px-3"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              >
                <option value="">{text("ทุกเดือน", "All months")}</option>
                {months.map((value) => (
                  <option key={value} value={value}>
                    {monthLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">{text("สถานะ", "Status")}</span>
              <select
                className="min-h-11 rounded-md border bg-card px-3"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">{text("ทุกสถานะ", "All statuses")}</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-end text-foreground"
              onClick={() => {
                setMonth("");
                setStatus("");
              }}
            >
              {text("ล้างตัวกรอง", "Clear filters")}
            </Button>
          </div>
          {selected && (
            <Link
              className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
              href={`/records/contracts/${encodeURIComponent(selected)}`}
            >
              {text("รายละเอียดสัญญา", "Contract details")}
            </Link>
          )}
          {renderList(documents(data.invoices), "invoice")}
          {renderList(documents(data.receipts), "receipt")}
        </>
      )}
      <DocumentPreviewModal
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        data={preview}
      />
    </div>
  );
}

