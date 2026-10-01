"use client";

import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  ExternalLink,
  FileCheck,
  FileQuestion,
  FileText,
  Image as ImageIcon,
  QrCode,
  Radio,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
  Award,
  Zap,
} from "lucide-react";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { operationKeys } from "./operation-columns";
import { TelemetryAgeLabel } from "./telemetry-age-label";
import { useLocale, useT } from "../../providers/locale-provider";
import { formatAppDate, formatAppDateTime, isIsoDateLike } from "../../lib/date-format";
import { renderStatusBadge, STATUS_MAP } from "../../lib/status-badge";
import { useFinancialCapabilities } from "../../lib/financial-capabilities";
import { useAuth } from "../../stores/auth-store";
import { SiteEditDialog } from "../sites/site-edit-dialog";
import { SiteDeleteDialog } from "../sites/site-delete-dialog";
import { SiteTelemetryDialog } from "../sites/site-telemetry-dialog";
import { PaymentDialog } from "../billing/payment-dialog";
import { PaymentVerificationDialog } from "../billing/payment-verification-dialog";
import { BillingDetailModal } from "../billing/billing-detail-modal";
import { DocumentPreviewModal, type DocumentPreviewData } from "./document-preview-modal";

export interface OperationCardListProps {
  resource: string;
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  idKey?: string;
  pageSize?: number;
  onOpenDetail?: (row: Record<string, any>) => void;
}

export function OperationCardList({
  resource,
  title,
  columns: rawColumns,
  rows,
  idKey = "id",
  pageSize = 10,
  onOpenDetail,
}: OperationCardListProps) {
  const t = useT();
  const locale = useLocale();

  const router = useRouter();
  const { user } = useAuth();
  const financial = useFinancialCapabilities();
  const isSchoolUser = user?.role === "school_user";

  const [searchTerm, setSearchTerm] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Site Edit, Delete & Telemetry Dialog State
  const [editSiteOpen, setEditSiteOpen] = React.useState(false);
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(null);
  const [deleteSiteOpen, setDeleteSiteOpen] = React.useState(false);
  const [selectedDeleteSite, setSelectedDeleteSite] = React.useState<{ id: string; name: string } | null>(null);
  const [telemetryDialogOpen, setTelemetryDialogOpen] = React.useState(false);
  const [selectedTelemetrySite, setSelectedTelemetrySite] = React.useState<{ id: string; name: string } | null>(null);

  // Billing & Payment Dialog States
  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [selectedPayCycle, setSelectedPayCycle] = React.useState<any | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = React.useState(false);
  const [selectedVerifyCycle, setSelectedVerifyCycle] = React.useState<any | null>(null);
  const [billingModalOpen, setBillingModalOpen] = React.useState(false);
  const [selectedBillingId, setSelectedBillingId] = React.useState<string | null>(null);
  const [slipPreviewOpen, setSlipPreviewOpen] = React.useState(false);
  const [slipPreviewUrl, setSlipPreviewUrl] = React.useState<string | null>(null);

  // Document Preview Modal State
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<DocumentPreviewData | null>(null);

  // Format numbers / currency
  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      maximumFractionDigits: 2,
    }).format(num);
  };

  const isStatusValue = (val: any) => {
    const str = String(val ?? "").trim().toLowerCase();
    return Boolean(STATUS_MAP[str] || STATUS_MAP[String(val ?? "").trim()]);
  };

  const getStatusBadge = (cell: string) => {
    return renderStatusBadge(cell, locale);
  };

  // Filter rows based on search term
  const filteredRows = React.useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((row) => {
      return Object.entries(row).some(([key, val]) => {
        if (key === idKey) return false;
        return String(val ?? "").toLowerCase().includes(term);
      });
    });
  }, [rows, searchTerm, idKey]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Column keys
  const keys = React.useMemo(() => {
    const first = rows[0];
    if (!first) return [];
    return operationKeys(resource,first,idKey);
  }, [rows, idKey, resource]);

  // Find primary title key & status key
  const titleKey = keys[0] || "title";
  const statusKey = keys.find((k) => k.toLowerCase().includes("status") || k.toLowerCase().includes("severity"));

  const secondaryKeys = keys.filter((k) => k !== titleKey && k !== statusKey);

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={locale === "th" ? `ค้นหา ${title}...` : `Search ${title}...`}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          className="pl-9 h-10 text-xs bg-card border-border shadow-2xs rounded-lg"
        />
      </div>

      {/* Cards List */}
      {pagedRows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center bg-card border-border/80 rounded-xl">
          <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground mb-2">
            <FileQuestion className="size-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {locale === "th" ? "ไม่พบข้อมูล" : "No data found"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {searchTerm
              ? (locale === "th" ? "ลองค้นหาด้วยคำค้นอื่น" : "Try searching with a different keyword")
              : (locale === "th" ? "ยังไม่มีรายการในขณะนี้" : "No records available at this time")}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {pagedRows.map((row, idx) => {
            const rawTitleVal = row[titleKey];
            const titleDisplay = String(rawTitleVal ?? "-");
            const statusVal = statusKey ? row[statusKey] : null;

            return (
              <Card
                key={row[idKey] ?? idx}
                className={`p-3.5 bg-card border-border/80 shadow-2xs rounded-xl space-y-2.5 hover:border-primary/40 transition-colors ${
                  onOpenDetail ? "cursor-pointer active:scale-[0.99] transition-transform" : ""
                }`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button, a, input")) return;
                  if (onOpenDetail) {
                    onOpenDetail(row);
                  }
                }}
              >
                {/* Card Header: Title + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                      {rawColumns[0] ?? titleKey}
                    </p>
                    <h3 className="text-sm font-bold text-foreground truncate mt-0.5">
                      {titleDisplay}
                    </h3>
                  </div>

                  {statusVal !== null && statusVal !== undefined && (
                    <div className="shrink-0">
                      {getStatusBadge(String(statusVal))}
                    </div>
                  )}
                </div>

                {/* Card Body: Secondary Details */}
                {secondaryKeys.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                    {(resource === "sites" ? secondaryKeys.filter(k=>k!=="lastSeenAt") : secondaryKeys.slice(0,4)).map((key, kIdx) => {
                      const colHeader = rawColumns[keys.indexOf(key)] ?? key;
                      const val = row[key];
                      const str = String(val ?? "-");

                      const isAmount =
                        key.toLowerCase().includes("amount") ||
                        key.toLowerCase().includes("ยอด") ||
                        key.toLowerCase().includes("price") ||
                        key.toLowerCase().includes("revenue");

                      const isEnergy =
                        key.toLowerCase().includes("kwh") ||
                        key.toLowerCase().includes("mwp") ||
                        key.toLowerCase().includes("power") ||
                        key.toLowerCase().includes("capacity");

                      const isSlip =
                        key.toLowerCase().includes("slip") ||
                        key === "หลักฐานการชำระ";

                      return (
                        <div key={key} className="space-y-0.5 min-w-0">
                          <span className="text-[10px] text-muted-foreground font-medium block truncate">
                            {colHeader}
                          </span>
                          {isSlip && str && str !== "-" && str !== "null" && str !== "undefined" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-2 gap-1 text-primary border-primary/30 hover:bg-primary/5 cursor-pointer font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSlipPreviewUrl(str);
                                setSlipPreviewOpen(true);
                              }}
                            >
                              <ImageIcon className="size-3" />
                              <span>{locale === "th" ? "ดูสลิป" : "View Slip"}</span>
                            </Button>
                          ) : (
                            <span className={`block truncate ${
                              isAmount
                                ? "font-semibold text-primary"
                                : isEnergy
                                ? "font-semibold text-foreground"
                                : isStatusValue(val)
                                ? ""
                                : "text-foreground"
                            }`}>
                              {resource === "sites" && ["lastUpdated","lastSeenAt","last_seen_at"].includes(key) ? (
                                <TelemetryAgeLabel value={val} locale={locale} compact />
                              ) : isStatusValue(val) ? (
                                getStatusBadge(str)
                              ) : isAmount ? (
                                `฿${formatNumber(val)}`
                              ) : isEnergy ? (
                                formatNumber(val)
                              ) : (key.toLowerCase().includes("date") || key.toLowerCase().includes("at") || key.toLowerCase().includes("time") || isIsoDateLike(str)) && str && str !== "-" ? (
                                str.includes(":") || str.includes("T") ? formatAppDateTime(str, locale) : formatAppDate(str, locale)
                              ) : (
                                str
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Mobile Action Buttons for Billing */}
                {resource === "billing" && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedBillingId(row[idKey] || row.id);
                        setBillingModalOpen(true);
                      }}
                      className="h-7 text-xs px-2.5 gap-1"
                    >
                      <Eye className="size-3 text-muted-foreground" />
                      <span>{locale === "th" ? "รายละเอียดรอบบิล" : "Billing Details"}</span>
                    </Button>

                    {/* School User Pay Button */}
                    {isSchoolUser && (row.status === "approved" || row.status === "pending_review" || row.status === "rejected" || !row.status) && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedPayCycle(row);
                          setPayDialogOpen(true);
                        }}
                        className="h-7 text-xs px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <QrCode className="size-3" />
                        <span>{locale === "th" ? "ชำระเงิน" : "Pay"}</span>
                      </Button>
                    )}

                    {/* Admin/Owner Verify Button */}
                    {financial.actions.includes("approve_payment") && (row.status === "pending_verification" || row.paymentStatus === "pending_verification" || row.slipUrl || row["หลักฐานการชำระ"]) && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedVerifyCycle(row);
                          setVerifyDialogOpen(true);
                        }}
                        className="h-7 text-xs px-2.5 gap-1 bg-primary text-primary-foreground"
                      >
                        <ShieldCheck className="size-3" />
                        <span>{locale === "th" ? "ตรวจสลิป" : "Verify"}</span>
                      </Button>
                    )}

                    {/* View Invoice PDF */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPreviewData({
                          type: "invoice",
                          documentId: row.invoiceId,
                          title: `ใบแจ้งหนี้ #${row.invoiceNumber || row[idKey] || row.id}`,
                          documentNumber: row.invoiceNumber || row[idKey] || row.id,
                          schoolName: row.schoolName || row["ชื่อโรงเรียน"],
                          amount: Number(row.amount || row["ยอดรวมสุทธิ"] || 0),
                          period: row.period || row["รอบบิล"],
                        });
                        setPreviewOpen(true);
                      }}
                      className="h-7 text-xs px-2 text-primary hover:underline gap-1"
                    >
                      <FileText className="size-3" />
                      <span>{locale === "th" ? "ใบแจ้งหนี้" : "Invoice"}</span>
                    </Button>

                    {/* View Receipt PDF (Only if paid / approved) */}
                    {(() => {
                      const isReceiptReady =
                        row.status === "paid" ||
                        row.paymentStatus === "approved" ||
                        row.paymentStatus === "paid";
                      if (isReceiptReady) {
                        return (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPreviewData({
                                type: "receipt",
                                documentId: row.receiptId,
                                title: `ใบเสร็จรับเงิน #${row.receiptNumber || row[idKey] || row.id}`,
                                documentNumber: row.receiptNumber || row[idKey] || row.id,
                                schoolName: row.schoolName || row["ชื่อโรงเรียน"],
                                amount: Number(row.amount || row["ยอดรวมสุทธิ"] || 0),
                                period: row.period || row["รอบบิล"],
                              });
                              setPreviewOpen(true);
                            }}
                            className="h-7 text-xs px-2 text-emerald-600 dark:text-emerald-400 hover:underline gap-1 font-medium"
                          >
                            <Receipt className="size-3" />
                            <span>{locale === "th" ? "ใบเสร็จ" : "Receipt"}</span>
                          </Button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Mobile Action Buttons for Contracts */}
                {resource === "contracts" && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewData({
                          type: "contract",
                          title: `สัญญาซื้อขายไฟฟ้า #${row.contractNumber || row.id}`,
                          documentNumber: row.contractNumber,
                          schoolName: row.schoolName,
                          siteName: row.siteName,
                          signers: row.signerName,
                          taxId: row.taxId,
                          taxAddress: row.taxAddress,
                          rates: row.rates || [],
                          period: row.startDate,
                        });
                        setPreviewOpen(true);
                      }}
                      className="h-7 text-xs px-2.5 gap-1 text-primary"
                    >
                      <FileText className="size-3" />
                      <span>{locale === "th" ? "ดูสัญญา" : "View Contract"}</span>
                    </Button>
                  </div>
                )}

                {/* Mobile Action Buttons for Receipts */}
                {resource === "receipts" && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewData({
                          type: "receipt",
                          documentId: row.id,
                          title: `ใบเสร็จรับเงิน #${row.receiptNumber || row.documentNumber || row.id}`,
                          documentNumber: row.receiptNumber || row.documentNumber,
                          schoolName: row.schoolName,
                          amount: Number(row.amount || 0),
                          period: row.period || row.issueDate,
                        });
                        setPreviewOpen(true);
                      }}
                      className="h-7 text-xs px-2.5 gap-1 text-emerald-600 dark:text-emerald-400"
                    >
                      <Receipt className="size-3" />
                      <span>{locale === "th" ? "ดูใบเสร็จ" : "View Receipt"}</span>
                    </Button>
                  </div>
                )}

                {/* Mobile Action Buttons for Sites */}
                {resource === "sites" && (
                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/40 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewData({
                          type: "handover",
                          title: `หนังสือส่งมอบระบบ #${row.name || row[idKey]}`,
                          documentNumber: row.certificateNumber,
                          schoolName: row.schoolName,
                          siteName: row.name,
                          capacityMwp: row.capacityMwp,
                          gatewaySerial: row.gatewaySerial,
                          meterSerial: row.deviceSerial,
                        });
                        setPreviewOpen(true);
                      }}
                      className="h-7 text-xs px-2 gap-1 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5 cursor-pointer font-medium"
                    >
                      <Award className="size-3" />
                      <span>{locale === "th" ? "ส่งมอบ" : "Handover"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTelemetrySite({
                          id: row[idKey] || row.id,
                          name: row.name || row["ชื่อไซต์"] || row["ชื่อไซต์งาน"] || "ไซต์งาน",
                        });
                        setTelemetryDialogOpen(true);
                      }}
                      className="h-7 text-xs px-2 gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5 cursor-pointer font-medium"
                    >
                      <Radio className="size-3 text-emerald-600 dark:text-emerald-400" />
                      <span>{locale === "th" ? "สด" : "Live"}</span>
                    </Button>
                    {user?.role === 'admin' && <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSiteId(row[idKey] || row.id);
                        setEditSiteOpen(true);
                      }}
                      className="h-7 text-xs px-2 gap-1 cursor-pointer"
                    >
                      <Edit className="size-3 text-primary" />
                      <span>{locale === "th" ? "แก้ไข" : "Edit"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDeleteSite({
                          id: row[idKey] || row.id,
                          name: row.name || row["ชื่อไซต์"] || row["ชื่อไซต์งาน"] || "ไซต์งาน",
                        });
                        setDeleteSiteOpen(true);
                      }}
                      className="h-7 text-xs px-2 gap-1 text-destructive hover:text-destructive cursor-pointer"
                    >
                      <Trash2 className="size-3" />
                      <span>{locale === "th" ? "ลบ" : "Delete"}</span>
                    </Button>
                    </>}
                  </div>
                )}

                {/* Mobile Action Buttons for Reports */}
                {resource === "reports" && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewData({
                          type: "settlement",
                          title: `รายงานสรุปพลังงาน #${row.id || "STM"}`,
                          documentNumber: row.statementNumber || "STM2026080001",
                          schoolName: row.schoolName || "สถานศึกษาในโครงการ",
                          siteName: row.siteName || "ไซต์อาคารหลัก",
                          amount: Number(row.amount || 10414.63),
                          period: row.period || "2026-08",
                          consumedKwh: row.consumedKwh,
                          rate: row.rate,
                        });
                        setPreviewOpen(true);
                      }}
                      className="h-7 text-xs px-2.5 gap-1 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                    >
                      <Zap className="size-3" />
                      <span>{locale === "th" ? "สรุปพลังงาน" : "Settlement"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetail?.(row)}
                      className="h-7 text-xs px-2.5 gap-1 text-primary cursor-pointer hover:bg-primary/5"
                    >
                      <Eye className="size-3" />
                      <span>{locale === "th" ? "ดูรายละเอียด" : "View Details"}</span>
                    </Button>
                  </div>
                )}

                {/* Mobile Action Buttons for Audit, Alerts, Users, Schools, Notifications */}
                {["audit", "alerts", "users", "schools", "notifications"].includes(resource) && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenDetail?.(row)}
                      className="h-7 text-xs px-2.5 gap-1 text-primary cursor-pointer hover:bg-primary/5"
                    >
                      <Eye className="size-3" />
                      <span>{locale === "th" ? "ดูรายละเอียด" : "View Details"}</span>
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Mobile Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 px-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {locale === "th"
              ? `หน้า ${currentPage} จาก ${totalPages} (${filteredRows.length} รายการ)`
              : `Page ${currentPage} of ${totalPages} (${filteredRows.length} items)`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="size-8 rounded-lg"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="size-8 rounded-lg"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Payment Dialog for School User */}
      <PaymentDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        billingCycle={selectedPayCycle}
        onSuccess={() => router.refresh()}
      />

      {/* Payment Verification Dialog for Admin / Owner */}
      <PaymentVerificationDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        billingCycle={selectedVerifyCycle}
        onSuccess={() => router.refresh()}
      />

      {/* Centered Billing Detail & Slip Split-View Modal */}
      <BillingDetailModal
        open={billingModalOpen}
        onOpenChange={setBillingModalOpen}
        billingId={selectedBillingId}
        onUpdated={() => router.refresh()}
        onOpenInvoice={(detail) => {
          setPreviewData({
            type: "invoice",
            documentId: detail.invoiceId,
            title: `ใบแจ้งหนี้ #${detail.invoiceNumber || detail.id}`,
            documentNumber: detail.invoiceNumber,
            schoolName: detail.schoolName,
            amount: Number(detail.amount || 0),
            period: detail.periodEnd,
          });
          setPreviewOpen(true);
        }}
        onOpenReceipt={(detail) => {
          setPreviewData({
            type: "receipt",
            documentId: detail.receiptId,
            title: `ใบเสร็จรับเงิน #${detail.receiptNumber || detail.invoiceNumber || detail.id}`,
            documentNumber: detail.receiptNumber,
            schoolName: detail.schoolName,
            amount: Number(detail.amount || 0),
            period: detail.periodEnd,
          });
          setPreviewOpen(true);
        }}
      />

      {/* High-Resolution Payment Slip Lightbox Dialog */}
      <Dialog open={slipPreviewOpen} onOpenChange={setSlipPreviewOpen}>
        <DialogContent className="sm:max-w-xl max-w-[95vw] p-4 bg-card border-border sm:rounded-2xl">
          <DialogHeader className="pb-2 border-b border-border/60">
            <DialogTitle className="text-sm font-semibold flex items-center justify-between gap-2 pr-6">
              <span className="flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" />
                {locale === "th" ? "หลักฐานสลิปการโอนเงิน" : "Payment Transfer Slip"}
              </span>
              {slipPreviewUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                >
                  <a href={slipPreviewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3" />
                    <span>{locale === "th" ? "เปิดภาพเต็ม" : "Full View"}</span>
                  </a>
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-2 bg-muted/20 rounded-xl overflow-hidden min-h-[300px]">
            {slipPreviewUrl ? (
              <img
                src={slipPreviewUrl}
                alt="Payment Slip Evidence"
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-sm border border-border/60"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {locale === "th" ? "ไม่พบไฟล์ภาพสลิป" : "Slip image not found"}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Interactive Document Preview Modal */}
      <DocumentPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewData}
      />

      {/* Site Edit Dialog for Mobile */}
      <SiteEditDialog
        open={editSiteOpen}
        onOpenChange={setEditSiteOpen}
        siteId={selectedSiteId}
      />

      {/* Site Delete Dialog for Mobile */}
      <SiteDeleteDialog
        open={deleteSiteOpen}
        onOpenChange={setDeleteSiteOpen}
        site={selectedDeleteSite}
      />

      {/* Site Telemetry & Raw Registers Dialog for Mobile */}
      <SiteTelemetryDialog
        open={telemetryDialogOpen}
        onOpenChange={setTelemetryDialogOpen}
        siteId={selectedTelemetrySite?.id}
        siteName={selectedTelemetrySite?.name}
      />
    </div>
  );
}
