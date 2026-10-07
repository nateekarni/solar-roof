"use client";

import * as React from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
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
  ArrowUpDown,
  Search,
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
import { SearchInput } from "./search-input";
import { Label } from "./label";
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
  variant?: "default" | "embedded";
  emptyContent?: React.ReactNode;
  renderSearchToolbar?: (search: React.ReactNode) => React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  searchKey,
  searchPlaceholder,
  filterComponent,
  actionsComponent,
  pageSize = 10,
  onRowClick,
  serverManaged = false,
  variant = "default",
  renderSearchToolbar,
  emptyContent,
}: DataTableProps<TData, TValue>) {
  const locale = useLocale();
  const searchId = React.useId();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
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
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
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
      {renderSearchToolbar?.(<SearchInput aria-label={searchPlaceholder ?? (locale === "th" ? "ค้นหาในตาราง" : "Search table")} placeholder={searchPlaceholder ?? (locale === "th" ? "ค้นหา…" : "Search…")} value={globalFilter} onChange={event=>setGlobalFilter(event.target.value)} />)}
      {/* Table Toolbar */}
      {!renderSearchToolbar && (!serverManaged || filterComponent || actionsComponent) && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-xs">
          {!serverManaged && <div className="space-y-2"><Label htmlFor={searchId}>{locale === "th" ? "ค้นหา" : "Search"}</Label><div className="relative w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id={searchId}
              placeholder={searchPlaceholder ?? (locale === "th" ? "ค้นหา…" : "Search…")}
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="h-10 pl-8 bg-card dark:bg-card border-border shadow-2xs"
            />
          </div></div>}
        </div>

        <div className="flex items-center gap-2">
          {filterComponent}
          {actionsComponent}

        </div>
      </div>}

      {/* Table Container */}
      <div className={cn("overflow-hidden bg-card", variant === "embedded" ? "border-0" : "rounded-xl border border-border shadow-xs")} style={{containerType:"inline-size"}}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="h-10 bg-muted/40 hover:bg-muted/40">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={header.column.id === "actions" ? {width:64,minWidth:64,maxWidth:64} : undefined}
                      className="h-10 py-0 text-xs font-semibold text-muted-foreground whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : !serverManaged && typeof header.column.columnDef.header === 'string' && header.column.getCanSort() ? <Button className="h-10 px-0 py-0 text-xs font-semibold hover:bg-transparent tracking-normal" variant="ghost" size="sm" onClick={() => header.column.toggleSorting(header.column.getIsSorted() === 'asc')}>{header.column.columnDef.header}<ArrowUpDown className="size-3"/></Button> : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className={variant === "embedded" ? "[&_tr]:border-y [&_tr]:border-border [&_tr:last-child]:border-b-0" : undefined}>
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
                      <TableCell key={cell.id} className="text-xs py-3" style={cell.column.id === "actions" ? {width:64,minWidth:64,maxWidth:64} : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={Math.max(1, table.getVisibleLeafColumns().length)} className="h-44 text-center">
                    {emptyContent ?? <Empty className="sticky left-0 gap-1 border-0 py-6" style={{width:"calc(100cqw - 1rem)"}}>
                      <EmptyMedia variant="icon">
                        <Database className="size-6 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>{locale === 'th' ? 'ไม่พบข้อมูล' : 'No results'}</EmptyTitle>
                      <EmptyDescription>
                        {locale === 'th' ? 'ไม่มีรายการข้อมูลที่ตรงกับเงื่อนไขการค้นหา' : 'No records match your search criteria.'}
                      </EmptyDescription>
                    </Empty>}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        {!serverManaged && <div data-slot="table-pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 bg-card/60">
          <div className="text-xs text-muted-foreground">
            {locale === "th" ? "แสดง" : "Showing"} <span className="font-semibold text-foreground">{table.getRowModel().rows.length}</span> {locale === "th" ? "จากทั้งหมด" : "of"}{" "}
            <span className="font-semibold text-foreground">{table.getFilteredRowModel().rows.length}</span> {locale === "th" ? "รายการ" : "records"}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{locale === "th" ? "ต่อหน้า" : "Rows per page"}</span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-10 w-16 text-xs">
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
              {locale === "th" ? "หน้า" : "Page"} <span className="font-semibold text-foreground">{table.getState().pagination.pageIndex + 1}</span> /{" "}
              {table.getPageCount() || 1}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                aria-label={locale === "th" ? "หน้าแรก" : "First page"}
              >
                <ChevronsLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label={locale === "th" ? "หน้าก่อนหน้า" : "Previous page"}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label={locale === "th" ? "หน้าถัดไป" : "Next page"}
              >
                <ChevronRight className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                aria-label={locale === "th" ? "หน้าสุดท้าย" : "Last page"}
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
