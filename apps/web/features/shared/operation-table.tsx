"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  MoreHorizontal,
  Eye,
  FileText,
  Receipt,
  FileCheck,
  Edit,
  QrCode,
  Radio,
  ShieldCheck,
  Trash2,
  ImageIcon,
  Award,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { DataTable } from "../../components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { operationKeys } from "./operation-columns";
import { TelemetryAgeLabel } from "./telemetry-age-label";
import { useLocale, useT } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";
import { OperationCardList } from "./operation-card-list";
import { DocumentPreviewModal, type DocumentPreviewData } from "./document-preview-modal";
import { BillingDetailModal } from "../billing/billing-detail-modal";
import { PaymentDialog } from "../billing/payment-dialog";
import { PaymentVerificationDialog } from "../billing/payment-verification-dialog";
import { SiteEditDialog } from "../sites/site-edit-dialog";
import { SiteDeleteDialog } from "../sites/site-delete-dialog";
import { SiteTelemetryDialog } from "../sites/site-telemetry-dialog";
import {
  AuditDetailModal,
  AlertDetailModal,
  UserDetailModal,
  SchoolDetailModal,
  NotificationDetailModal,
  ReportDetailModal,
} from "./detail-modals";
import { renderStatusBadge, STATUS_MAP } from "../../lib/status-badge";
import { formatAppDate, formatAppDateTime, isIsoDateLike } from "../../lib/date-format";

type SummaryItem = {
  label: string;
  value: string | number;
  unit: string;
  note: string;
};

export interface OperationTableProps {
  resource: string;
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  summary: SummaryItem[];
  idKey?: string | undefined;
}

const COLUMN_TRANSLATIONS: Record<string, string> = {
  "ชื่อโรงเรียน": "School Name",
  "ภูมิภาค": "Region",
  "กำลังติดตั้ง (MWp)": "Capacity (MWp)",
  "จำนวนไซต์": "Sites Count",
  "Gateway": "Gateway",
  "สถานะ": "Status",
  "ชื่อไซต์": "Site Name",
  "โรงเรียน": "School",
  "โพรโทคอล": "Protocol",
  "ผลิตสะสม (kWh)": "Production (kWh)",
  "รอบบิล": "Billing Period",
  "พลังงานที่ใช้ (kWh)": "Consumed (kWh)",
  "อัตราค่าไฟ (บาท)": "Rate (THB)",
  "ยอดเงินรวม (บาท)": "Amount (THB)",
  "ระดับความรุนแรง": "Severity",
  "หัวข้อ": "Title",
  "รายละเอียด": "Detail",
  "เวลาที่เกิด": "Occurred At",
  "การดำเนินการ": "Action",
  "ผู้ดำเนินการ": "Actor",
  "ตาราง/เป้าหมาย": "Target",
  "วันเวลา": "Timestamp",
  "เลขที่สัญญา": "Contract No.",
  "เวอร์ชัน": "Version",
  "วันเริ่มต้น": "Start Date",
  "อัตราค่าไฟ (฿)": "Tariff (THB)",
  "คู่สัญญา": "Signers",
  "เลขที่เอกสาร": "Doc Number",
  "ประเภท": "Type",
  "วันที่ออก": "Issue Date",
  "จำนวนเงิน (฿)": "Amount (THB)",
  "เลขที่ใบเสร็จ": "Receipt No.",
  "เลขที่ใบกำกับภาษี": "Tax Invoice No.",
  "ยอดเงินสุทธิ (บาท)": "Total (THB)",
  "ไซต์": "Site",
  "พลังงาน (kWh)": "Energy (kWh)",
  "อัตรา (฿/kWh)": "Rate (฿/kWh)",
  "ยอดเงิน (฿)": "Amount (฿)",
  "หลักฐานการชำระ": "Payment Slip",
  "อัปเดตล่าสุด": "Last Updated",
};

export function OperationTable({
  resource,
  title,
  columns: rawColumns,
  rows,
  summary,
  idKey = "id",
}: OperationTableProps) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const isSchoolUser = user?.role === "school_user";
  const isOwner = user?.role === "owner";

  // Payment Dialog States
  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [selectedPayCycle, setSelectedPayCycle] = React.useState<any | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = React.useState(false);
  const [selectedVerifyCycle, setSelectedVerifyCycle] = React.useState<any | null>(null);

  // Document Preview Modal State
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<DocumentPreviewData | null>(null);

  // Billing Detail Modal State
  const [billingSheetOpen, setBillingSheetOpen] = React.useState(false);
  const [selectedBillingId, setSelectedBillingId] = React.useState<string | null>(null);
  const [selectedBillingRow, setSelectedBillingRow] = React.useState<any | null>(null);

  // Payment Slip Lightbox State
  const [slipImageModalOpen, setSlipImageModalOpen] = React.useState(false);
  const [selectedSlipImage, setSelectedSlipImage] = React.useState<string | null>(null);

  // Site Edit, Delete & Telemetry Dialog State
  const [editSiteOpen, setEditSiteOpen] = React.useState(false);
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(null);
  const [deleteSiteOpen, setDeleteSiteOpen] = React.useState(false);
  const [selectedDeleteSite, setSelectedDeleteSite] = React.useState<{ id: string; name: string } | null>(null);
  const [telemetryDialogOpen, setTelemetryDialogOpen] = React.useState(false);
  const [selectedTelemetrySite, setSelectedTelemetrySite] = React.useState<{ id: string; name: string } | null>(null);

  // Dedicated Detail Modal States for Operations Resources
  const [auditModalOpen, setAuditModalOpen] = React.useState(false);
  const [selectedAuditEvent, setSelectedAuditEvent] = React.useState<any | null>(null);

  const [alertModalOpen, setAlertModalOpen] = React.useState(false);
  const [selectedAlert, setSelectedAlert] = React.useState<any | null>(null);

  const [userModalOpen, setUserModalOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);

  const [schoolModalOpen, setSchoolModalOpen] = React.useState(false);
  const [selectedSchool, setSelectedSchool] = React.useState<any | null>(null);

  const [notificationModalOpen, setNotificationModalOpen] = React.useState(false);
  const [selectedNotification, setSelectedNotification] = React.useState<any | null>(null);

  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const [selectedReport, setSelectedReport] = React.useState<any | null>(null);

  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      maximumFractionDigits: 2,
    }).format(num);
  };

  const openDocumentPreview = (
    type: "contract" | "invoice" | "receipt" | "settlement" | "handover",
    row: Record<string, any>
  ) => {
    setPreviewData({
      type,
      documentId: type === "invoice" ? row.invoiceId || (resource === "documents" ? row.id : undefined) : type === "receipt" ? row.receiptId || (resource === "receipts" ? row.id : undefined) : undefined,
      siteId: row.siteId,
      billingCycleId: row.billingCycleId,
      documentNumber: row.documentNumber || (type === "receipt" ? row.receiptNumber : row.invoiceNumber),
      schoolName: row.schoolName,
      siteName: row.siteName,
      period: row.period || row.periodStart,
      issueDate: row.issueDate || row.startDate,
      dueDate: row.dueDate,
      consumedKwh: row.consumedKwh,
      rate: row.rate,
      amount: row.amount ?? row.totalAmount,
      status: row.status,
      signers: row.signerName || row.signers,
      version: row.version,
      capacityMwp: row.capacityMwp,
      taxId: row.taxId,
      taxBranch: row.branch,
      taxAddress: row.taxAddress,
      taxEmail: row.billingEmail,
      taxPhone: row.billingPhone,
      rates: row.rates || [],
      gatewaySerial: row.gatewaySerial,
      meterSerial: row.meterSerial,
      paymentMethod: row.paymentMethod,
      paidAt: row.paidAt,
    });
    setPreviewOpen(true);
  };

  const openBillingDetail = (id: string, row?: Record<string, any>) => {
    setSelectedBillingId(id);
    if (row) setSelectedBillingRow(row);
    setBillingSheetOpen(true);
  };

  const openResourceDetail = (res: string, item: Record<string, any>) => {
    if (res === "audit") {
      setSelectedAuditEvent(item);
      setAuditModalOpen(true);
    } else if (res === "alerts") {
      setSelectedAlert(item);
      setAlertModalOpen(true);
    } else if (res === "users") {
      setSelectedUser(item);
      setUserModalOpen(true);
    } else if (res === "schools") {
      setSelectedSchool(item);
      setSchoolModalOpen(true);
    } else if (res === "notifications") {
      setSelectedNotification(item);
      setNotificationModalOpen(true);
    } else if (res === "reports") {
      setSelectedReport(item);
      setReportModalOpen(true);
    } else if (res === "contracts") {
      openDocumentPreview("contract", item);
    } else if (res === "receipts") {
      openDocumentPreview("receipt", item);
    } else if (res === "documents") {
      openDocumentPreview("invoice", item);
    } else if (res === "billing") {
      const itemId = item[idKey] || item.id;
      openBillingDetail(itemId, item);
    }
  };

  const tableColumns = React.useMemo<ColumnDef<Record<string, any>, any>[]>(() => {
    const firstRow = rows[0];
    if (!firstRow) return [];

    const keys = operationKeys(resource,firstRow,idKey);

    const cols: ColumnDef<Record<string, any>, any>[] = keys.map((key, idx) => {
      const rawTitle = rawColumns[idx] ?? key;
      const headerTitle =
        locale === "en" && COLUMN_TRANSLATIONS[rawTitle]
          ? COLUMN_TRANSLATIONS[rawTitle]
          : rawTitle;

      return {
        accessorKey: key,
        meta: { title: headerTitle },
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-10 py-0 text-xs font-semibold hover:bg-transparent tracking-normal"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              {headerTitle}
              <ArrowUpDown className="ml-1.5 size-3 text-muted-foreground" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const val = row.getValue(key);
          const str = String(val ?? "-").trim();
          const lower = str.toLowerCase();

          if (
            key.toLowerCase().includes("status") ||
            key.toLowerCase().includes("severity") ||
            STATUS_MAP[lower] ||
            STATUS_MAP[str]
          ) {
            return renderStatusBadge(str, locale);
          }

          if (key.toLowerCase().includes("amount") || key.toLowerCase().includes("ยอด")) {
            return (
              <span className="font-semibold text-foreground">
                ฿{formatNumber(val)}
              </span>
            );
          }

          if (key.toLowerCase().includes("kwh") || key.toLowerCase().includes("mwp")) {
            return (
              <span className="font-medium text-foreground">
                {formatNumber(val)}
              </span>
            );
          }

          if (key.toLowerCase().includes("slip") || key.includes("หลักฐาน")) {
            if (val && str !== "-" && str !== "null" && str !== "") {
              return (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2.5 gap-1.5 text-primary border-primary/30 hover:bg-primary/5 cursor-pointer font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSlipImage(str);
                    setSlipImageModalOpen(true);
                  }}
                >
                  <ImageIcon className="size-3.5 text-primary" />
                  <span>{locale === "th" ? "ดูสลิป" : "View Slip"}</span>
                </Button>
              );
            }
            return <span className="text-xs text-muted-foreground/60 italic">{locale === "th" ? "ยังไม่แนบ" : "No Slip"}</span>;
          }

          if (
            key === "lastUpdated" ||
            key === "lastSeenAt" ||
            key === "last_seen_at" ||
            key === "อัปเดตล่าสุด" ||
            headerTitle === "Last Updated" ||
            headerTitle === "อัปเดตล่าสุด"
          ) {
            if (!val || str === "-" || str === "null" || str === "") {
              return (
                <span className="text-xs text-muted-foreground/60 italic">
                  {locale === "th" ? "ยังไม่มีข้อมูล" : "No telemetry"}
                </span>
              );
            }
            return <TelemetryAgeLabel value={val} locale={locale} />;
          }

          if (
            key.toLowerCase().includes("date") ||
            key.toLowerCase().includes("at") ||
            key.toLowerCase().includes("time") ||
            key.toLowerCase().includes("วัน") ||
            key.toLowerCase().includes("เวลา") ||
            isIsoDateLike(str)
          ) {
            if (str && str !== "-") {
              const formatted = str.includes(":") || str.includes("T")
                ? formatAppDateTime(str, locale)
                : formatAppDate(str, locale);
              return <span className="text-xs text-foreground font-normal">{formatted}</span>;
            }
          }

          return <span className="text-xs text-foreground">{str}</span>;
        },
      };
    });

    // Append Action column (header empty string / visually hidden label)
    cols.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original;
        const itemId = item[idKey] || item.id;

        return (
          <div className="flex items-center justify-end pr-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md cursor-pointer"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 text-xs bg-card border-border shadow-lg">
                {resource === "contracts" ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("contract", item)}
                      className="gap-2 cursor-pointer font-medium"
                    >
                      <FileCheck className="size-3.5 text-primary" />
                      <span>{locale === "th" ? "ดูเอกสารสัญญา (PPA)" : "View Contract (PPA)"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("invoice", item)}
                      className="gap-2 cursor-pointer"
                    >
                      <FileText className="size-3.5 text-muted-foreground" />
                      <span>{locale === "th" ? "ดูใบเรียกเก็บเงิน / ใบแจ้งหนี้" : "View Invoice"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("receipt", item)}
                      className="gap-2 cursor-pointer"
                    >
                      <Receipt className="size-3.5 text-muted-foreground" />
                      <span>{locale === "th" ? "ดูใบเสร็จรับเงิน" : "View Receipt"}</span>
                    </DropdownMenuItem>
                  </>
                ) : resource === "billing" ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => openBillingDetail(itemId)}
                      className="gap-2 cursor-pointer font-medium"
                    >
                      <Eye className="size-3.5 text-primary" />
                      <span>{locale === "th" ? "ดูรายละเอียดรอบบิล" : "View Billing Details"}</span>
                    </DropdownMenuItem>

                    {/* School User Pay Option */}
                    {isSchoolUser && (item.status === "approved" || item.status === "pending_review" || item.status === "rejected" || !item.status) && (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedPayCycle(item);
                          setPayDialogOpen(true);
                        }}
                        className="gap-2 cursor-pointer font-semibold text-emerald-600 dark:text-emerald-400"
                      >
                        <QrCode className="size-3.5 text-emerald-600" />
                        <span>{locale === "th" ? "ชำระเงินและแนบสลิป" : "Pay with Slip"}</span>
                      </DropdownMenuItem>
                    )}

                    {/* Admin/Owner Verify Option */}
                    {!isSchoolUser && (item.status === "pending_verification" || item.paymentStatus === "pending_verification" || item.slipUrl) && (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedVerifyCycle(item);
                          setVerifyDialogOpen(true);
                        }}
                        className="gap-2 cursor-pointer font-semibold text-primary"
                      >
                        <ShieldCheck className="size-3.5 text-primary" />
                        <span>{locale === "th" ? "ตรวจสอบสลิปการโอน" : "Verify Payment Slip"}</span>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("invoice", item)}
                      className="gap-2 cursor-pointer"
                    >
                      <FileText className="size-3.5 text-muted-foreground" />
                      <span>{locale === "th" ? "ดูใบแจ้งหนี้ (Invoice)" : "View Invoice"}</span>
                    </DropdownMenuItem>
                    {(() => {
                      const isReceiptReady =
                        item.status === "paid" ||
                        item.paymentStatus === "approved" ||
                        item.paymentStatus === "paid";
                      if (isReceiptReady) {
                        return (
                          <DropdownMenuItem
                            onClick={() => openDocumentPreview("receipt", item)}
                            className="gap-2 cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium"
                          >
                            <Receipt className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{locale === "th" ? "ดูใบเสร็จรับเงิน" : "View Receipt"}</span>
                          </DropdownMenuItem>
                        );
                      }
                      return (
                        <DropdownMenuItem
                          disabled
                          className="gap-2 opacity-50 cursor-not-allowed text-muted-foreground"
                        >
                          <Receipt className="size-3.5 text-muted-foreground" />
                          <span>{locale === "th" ? "ดูใบเสร็จรับเงิน (ออกได้เมื่ออนุมัติแล้ว)" : "View Receipt (Available upon approval)"}</span>
                        </DropdownMenuItem>
                      );
                    })()}
                  </>
                ) : resource === "receipts" || resource === "documents" ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("receipt", item)}
                      className="gap-2 cursor-pointer font-medium"
                    >
                      <Receipt className="size-3.5 text-primary" />
                      <span>{locale === "th" ? "ดูใบเสร็จรับเงิน / ใบกำกับภาษี" : "View Receipt"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("invoice", item)}
                      className="gap-2 cursor-pointer"
                    >
                      <FileText className="size-3.5 text-muted-foreground" />
                      <span>{locale === "th" ? "ดูใบแจ้งหนี้ / ใบเรียกเก็บเงิน" : "View Invoice"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("contract", item)}
                      className="gap-2 cursor-pointer"
                    >
                      <FileCheck className="size-3.5 text-muted-foreground" />
                      <span>{locale === "th" ? "ดูเอกสารสัญญาที่เกี่ยวข้อง" : "View Contract"}</span>
                    </DropdownMenuItem>
                  </>
                ) : resource === "sites" ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("handover", item)}
                      className="gap-2 cursor-pointer font-medium text-amber-600 dark:text-amber-400"
                    >
                      <Award className="size-3.5 text-amber-600 dark:text-amber-400" />
                      <span>{locale === "th" ? "ดูหนังสือส่งมอบระบบ (Handover)" : "Handover Certificate"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedTelemetrySite({
                          id: itemId,
                          name: item.name || item["ชื่อไซต์"] || item["ชื่อไซต์งาน"] || "ไซต์งาน",
                        });
                        setTelemetryDialogOpen(true);
                      }}
                      className="gap-2 cursor-pointer font-medium text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
                    >
                      <Radio className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{locale === "th" ? "สัญญาณสด & Raw Registers" : "Live Telemetry & Registers"}</span>
                    </DropdownMenuItem>
                    {user?.role === "admin" && (
                      <>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedSiteId(itemId);
                            setEditSiteOpen(true);
                          }}
                          className="gap-2 cursor-pointer font-medium"
                        >
                          <Edit className="size-3.5 text-primary" />
                          <span>{locale === "th" ? "แก้ไขข้อมูลไซต์งาน" : "Edit Site"}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedDeleteSite({
                              id: itemId,
                              name: item.name || item["ชื่อไซต์"] || item["ชื่อไซต์งาน"] || "ไซต์งาน",
                            });
                            setDeleteSiteOpen(true);
                          }}
                          className="gap-2 cursor-pointer text-destructive focus:text-destructive font-medium"
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                          <span>{locale === "th" ? "ลบไซต์งาน" : "Delete Site"}</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                ) : resource === "reports" ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => openDocumentPreview("settlement", item)}
                      className="gap-2 cursor-pointer font-medium text-emerald-600 dark:text-emerald-400"
                    >
                      <Zap className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{locale === "th" ? "ดูสรุปรายงานพลังงาน (Settlement)" : "View Settlement Statement"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openResourceDetail(resource, item)}
                      className="gap-2 cursor-pointer font-medium"
                    >
                      <Eye className="size-3.5 text-primary" />
                      <span>{locale === "th" ? "ดูรายละเอียด" : "View Details"}</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onClick={() => openResourceDetail(resource, item)}
                    className="gap-2 cursor-pointer font-medium"
                  >
                    <Eye className="size-3.5 text-primary" />
                    <span>{locale === "th" ? "ดูรายละเอียด" : "View Details"}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });

    return cols;
  }, [rows, rawColumns, idKey, locale, resource, openResourceDetail]);

  const searchPlaceholder =
    locale === "th"
      ? `ค้นหา ${title}...`
      : `Search ${title}...`;

  return (
    <>
      {/* Top Summary Stat Cards */}
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((stat, i) => (
            <Card className="stat-card" key={i}>
              <div className="stat-header">
                <span className="stat-label text-xs font-medium text-muted-foreground">
                  {stat.label}
                </span>
              </div>
              <div className="stat-value">
                <strong>
                  {formatNumber(stat.value)}{" "}
                  {stat.unit && <em>{stat.unit}</em>}
                </strong>
                {stat.note && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium h-4.5 px-1.5 rounded-full shrink-0 leading-none"
                  >
                    {stat.note}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Mobile Card View (< 768px) */}
      <div className="block md:hidden">
        <OperationCardList
          resource={resource}
          title={title}
          columns={rawColumns}
          rows={rows}
          idKey={idKey}
          pageSize={10}
          onOpenDetail={(row) => openResourceDetail(resource, row)}
        />
      </div>

      {/* Desktop Shadcn DataTable (>= 768px) */}
      <div className="hidden md:block">
        <DataTable
          columns={tableColumns}
          data={rows}
          searchPlaceholder={searchPlaceholder}
          pageSize={10}
          onRowClick={(row) => {
            const itemId = row[idKey] || row.id;
            if (resource === "billing") {
              openBillingDetail(itemId);
            } else if (resource === "sites") {
              setSelectedTelemetrySite({
                id: itemId,
                name: row.name || row["ชื่อไซต์"] || row["ชื่อไซต์งาน"] || "ไซต์งาน",
              });
              setTelemetryDialogOpen(true);
            } else {
              openResourceDetail(resource, row);
            }
          }}
        />
      </div>

      {/* Interactive Document Preview Modal */}
      <DocumentPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewData}
      />

      {/* Centered Billing Detail Modal with Evidence & Inline Actions */}
      <BillingDetailModal
        open={billingSheetOpen}
        onOpenChange={setBillingSheetOpen}
        billingId={selectedBillingId}
        initialData={selectedBillingRow}
        onUpdated={() => {
          router.refresh();
        }}
        onOpenInvoice={(detail) => {
          openDocumentPreview("invoice", detail);
        }}
        onOpenReceipt={(detail) => {
          openDocumentPreview("receipt", detail);
        }}
      />

      {/* High-Resolution Bank Slip Lightbox Dialog */}
      {selectedSlipImage && (
        <Dialog open={slipImageModalOpen} onOpenChange={setSlipImageModalOpen}>
          <DialogContent className="sm:max-w-xl w-full p-4 bg-card border-border sm:rounded-2xl">
            <DialogHeader className="pb-3 border-b border-border/60">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" />
                <span>{locale === "th" ? "หลักฐานการโอนเงิน (สลิปธนาคาร)" : "Bank Transfer Slip"}</span>
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 max-h-[80vh] overflow-auto flex items-center justify-center bg-muted/20 rounded-xl">
              <img
                src={selectedSlipImage}
                alt="Bank Transfer Slip"
                className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-sm"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Site Edit Dialog */}
      <SiteEditDialog
        open={editSiteOpen}
        onOpenChange={setEditSiteOpen}
        siteId={selectedSiteId}
      />

      {/* Site Delete Dialog */}
      <SiteDeleteDialog
        open={deleteSiteOpen}
        onOpenChange={setDeleteSiteOpen}
        site={selectedDeleteSite}
      />

      {/* Site Telemetry & Raw Registers Dialog */}
      <SiteTelemetryDialog
        open={telemetryDialogOpen}
        onOpenChange={setTelemetryDialogOpen}
        siteId={selectedTelemetrySite?.id}
        siteName={selectedTelemetrySite?.name}
      />

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

      {/* Dedicated Resource Detail Modals */}
      <AuditDetailModal
        open={auditModalOpen}
        onOpenChange={setAuditModalOpen}
        event={selectedAuditEvent}
      />

      <AlertDetailModal
        open={alertModalOpen}
        onOpenChange={setAlertModalOpen}
        alert={selectedAlert}
        onAcknowledged={() => router.refresh()}
      />

      <UserDetailModal
        open={userModalOpen}
        onOpenChange={setUserModalOpen}
        user={selectedUser}
      />

      <SchoolDetailModal
        open={schoolModalOpen}
        onOpenChange={setSchoolModalOpen}
        school={selectedSchool}
      />

      <NotificationDetailModal
        open={notificationModalOpen}
        onOpenChange={setNotificationModalOpen}
        notification={selectedNotification}
      />

      <ReportDetailModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        report={selectedReport}
      />
    </>
  );
}
