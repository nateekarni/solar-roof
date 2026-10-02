"use client";

import * as React from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Button } from "./button";
import { Input } from "./input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "./empty";
import { useLocale } from "../../providers/locale-provider";
import { cn } from "../../lib/utils";

const DEFAULT_COLUMN_TITLES: Record<string, { th: string; en: string }> = {
  name: { th: "ชื่อโรงเรียน", en: "School Name" },
  schoolName: { th: "โรงเรียน", en: "School" },
  siteName: { th: "ชื่อไซต์", en: "Site Name" },
  region: { th: "ภูมิภาค", en: "Region" },
  capacityMwp: { th: "กำลังติดตั้ง (MWp)", en: "Capacity (MWp)" },
  sitesCount: { th: "จำนวนไซต์", en: "Sites Count" },
  gatewaysCount: { th: "Gateway", en: "Gateways Count" },
  gateway: { th: "Gateway", en: "Gateway" },
  status: { th: "สถานะ", en: "Status" },
  protocol: { th: "โพรโทคอล", en: "Protocol" },
  productionKwh: { th: "ผลิตสะสม (kWh)", en: "Production (kWh)" },
  period: { th: "รอบบิล", en: "Billing Period" },
  consumedKwh: { th: "พลังงานที่ใช้ (kWh)", en: "Consumed (kWh)" },
  rate: { th: "อัตราค่าไฟ", en: "Rate" },
  amount: { th: "ยอดรวม", en: "Amount" },
  severity: { th: "ระดับความรุนแรง", en: "Severity" },
  title: { th: "หัวข้อ", en: "Title" },
  detail: { th: "รายละเอียด", en: "Detail" },
  occurredAt: { th: "เวลาที่เกิด", en: "Occurred At" },
  action: { th: "การดำเนินการ", en: "Action" },
  actor: { th: "ผู้ดำเนินการ", en: "Actor" },
  entity: { th: "ข้อมูลเป้าหมาย", en: "Target" },
  timestamp: { th: "วันเวลา", en: "Timestamp" },
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  getRowId?: (row:TData)=>string;
  searchKey?: string;
  searchPlaceholder?: string;
  filterComponent?: React.ReactNode;
  actionsComponent?: React.ReactNode;
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  serverManaged?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  searchKey,
  searchPlaceholder = "ค้นหา...",
  filterComponent,
  actionsComponent,
  pageSize = 10,
  onRowClick,
  serverManaged = false,
}: DataTableProps<TData, TValue>) {
  const locale = useLocale();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    ...(getRowId ? {getRowId} : {}),
    columns,
    manualPagination: serverManaged,
    manualFiltering: serverManaged,
    manualSorting: serverManaged,
    enableSorting: !serverManaged,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  return (
    <div className="space-y-3.5 w-full">
      {/* Table Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          {!serverManaged && <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="h-9 pl-8 text-xs bg-white dark:bg-card border-border shadow-2xs"
            />
          </div>}
          {filterComponent}
        </div>

        <div className="flex items-center gap-2">
          {actionsComponent}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-1.5 text-xs font-medium bg-white dark:bg-card border-border shadow-xs hover:bg-neutral-50 dark:hover:bg-accent"
              >
                <SlidersHorizontal className="size-3.5" />
                {locale === "en" ? "Columns" : "คอลัมน์"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">
                {locale === "en" ? "Toggle Columns" : "แสดง/ซ่อนคอลัมน์"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const metaTitle = (column.columnDef.meta as { title?: string })?.title;
                  const dictTitle = DEFAULT_COLUMN_TITLES[column.id]?.[locale === "th" ? "th" : "en"];
                  const headerStr = typeof column.columnDef.header === "string" ? column.columnDef.header : undefined;
                  const title = metaTitle || dictTitle || headerStr || column.id;
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="text-xs cursor-pointer"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {title}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="h-10 bg-muted/40 hover:bg-muted/40">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-10 py-0 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={(event) => {
                      if (onRowClick && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        onRowClick(row.original);
                      }
                    }}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (
                        target.closest(
                          "button, a, input, select, [role=menuitem], [data-slot=dropdown-menu-trigger]"
                        )
                      ) {
                        return;
                      }
                      onRowClick?.(row.original);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-xs py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-44 text-center">
                    <Empty className="py-6">
                      <EmptyMedia variant="icon">
                        <Database className="size-6 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>ไม่พบข้อมูล</EmptyTitle>
                      <EmptyDescription>
                        ไม่มีรายการข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                      </EmptyDescription>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        {!serverManaged && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 bg-card/60">
          <div className="text-xs text-muted-foreground">
            แสดง <span className="font-semibold text-foreground">{table.getRowModel().rows.length}</span> จากทั้งหมด{" "}
            <span className="font-semibold text-foreground">{table.getFilteredRowModel().rows.length}</span> รายการ
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">ต่อหน้า</span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`} className="text-xs">
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground whitespace-nowrap">
              หน้า <span className="font-semibold text-foreground">{table.getState().pagination.pageIndex + 1}</span> /{" "}
              {table.getPageCount() || 1}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                aria-label="หน้าแรก"
              >
                <ChevronsLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="หน้าก่อนหน้า"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="หน้าถัดไป"
              >
                <ChevronRight className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                aria-label="หน้าสุดท้าย"
              >
                <ChevronsRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
