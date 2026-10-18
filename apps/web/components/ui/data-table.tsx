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
import { SearchInput } from "./search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
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
  hideSearch?: boolean;
  renderMobileRow?: (row: TData) => React.ReactNode;
  renderPageToolbar?: (rows: TData[]) => React.ReactNode;
  searchPlaceholder?: string;
  filterComponent?: React.ReactNode;
  actionsComponent?: React.ReactNode;
  pageSize?: number;
  onRowClick?: ((row: TData) => void) | undefined;
  onViewChange?: () => void;
  serverManaged?: boolean;
  variant?: "default" | "embedded";
  emptyContent?: React.ReactNode;
  renderSearchToolbar?: (search: React.ReactNode) => React.ReactNode;
}

function getColumnStyle(column: any): React.CSSProperties | undefined {
  if (column.id === "actions") return { width: 56, minWidth: 56, maxWidth: 64 };
  if (['selection', 'select'].includes(column.id)) return { width: 1, minWidth: 40, maxWidth: 40 };
  const size = column.columnDef?.size;
  if (typeof size === 'number' && size > 0) {
    const min = column.columnDef.minSize ?? size;
    const max = column.columnDef.maxSize ?? size;
    return { width: size, minWidth: min, maxWidth: max };
  }
  return undefined;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  getRowId,
  searchKey,
  hideSearch = false,
  renderMobileRow,
  renderPageToolbar,
  searchPlaceholder,
  filterComponent,
  actionsComponent,
  pageSize = 50,
  onRowClick,
  onViewChange,
  serverManaged = false,
  variant = "default",
  renderSearchToolbar,
  emptyContent,
}: DataTableProps<TData, TValue>) {
  const locale = useLocale();
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

  const {pageIndex,pageSize:currentPageSize}=table.getState().pagination;
  const sortingKey=JSON.stringify(sorting),filterKey=JSON.stringify(columnFilters);
  React.useEffect(()=>{onViewChange?.();},[onViewChange,pageIndex,currentPageSize,sortingKey,filterKey,globalFilter]);

  return (
    <div className="space-y-3.5 w-full">
      {renderSearchToolbar?.(<SearchInput aria-label={searchPlaceholder ?? (locale === "th" ? "ค้นหาในตาราง" : "Search table")} placeholder={searchPlaceholder ?? (locale === "th" ? "ค้นหา…" : "Search…")} value={globalFilter} onChange={event=>setGlobalFilter(event.target.value)} />)}
      {/* Table Toolbar */}
      {!renderSearchToolbar && ((!serverManaged && !hideSearch) || filterComponent || actionsComponent) && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-xs">
          {!serverManaged && !hideSearch && <SearchInput
            aria-label={locale === 'th' ? 'ค้นหาในตาราง' : 'Search table'}
            placeholder={searchPlaceholder ?? (locale === 'th' ? 'ค้นหา…' : 'Search…')}
            value={globalFilter} onChange={event => setGlobalFilter(event.target.value)} />}

        </div>

        <div className="flex items-center gap-2">
          {filterComponent}
          {actionsComponent}

        </div>
      </div>}

      {renderPageToolbar?.(table.getRowModel().rows.map(row => row.original))}
      {renderMobileRow && <div className="flex flex-col gap-3 md:hidden">
        {table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <React.Fragment key={row.id}>{renderMobileRow(row.original)}</React.Fragment>) : emptyContent ?? <Empty><EmptyTitle>{locale === 'th' ? 'ไม่พบข้อมูล' : 'No results'}</EmptyTitle></Empty>}
      </div>}
      {/* Table Container */}
      <div className={cn("overflow-hidden bg-card", variant === "embedded" ? "border-0" : "rounded-xl border border-border shadow-xs", renderMobileRow && "border-0 rounded-none shadow-none md:rounded-xl md:border md:shadow-xs")} style={{containerType:"inline-size"}}>
        <div className={cn("overflow-x-auto", renderMobileRow && "hidden md:block")}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="h-10 bg-card hover:bg-card">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={getColumnStyle(header.column)}
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
                      <TableCell key={cell.id} className={cn("text-xs py-3", cell.column.id === "actions" && "text-right")} style={getColumnStyle(cell.column)}>
                        {cell.column.id === "actions" ? <div className="flex justify-end">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div> : flexRender(cell.column.columnDef.cell, cell.getContext())}
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
        {!serverManaged && table.getFilteredRowModel().rows.length > 0 && <div data-slot="table-pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 bg-card">
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
                <SelectTrigger aria-label={locale === "th" ? "จำนวนรายการต่อหน้า" : "Rows per page"} className="h-10 w-16 text-xs">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top"><SelectGroup>
                  {[10, 25, 50, 100].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`} className="text-xs">
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectGroup></SelectContent>
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
