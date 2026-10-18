'use client';

import { formatAppDateTime } from '../../lib/date-format';
import { TelemetryAgeLabel } from '../shared/telemetry-age-label';
import React, { useState } from 'react';
import { MoreHorizontal, Radio } from 'lucide-react';
import { DataTable } from '../../components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '../../components/ui/button';
import { SearchInput } from '../../components/ui/search-input';
import { ChoiceSelect } from '../../components/ui/choice-select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import type { DiscoveredGatewayRow } from '@solar/api-contracts';

export interface GatewayRow {
  id: string;
  siteId: string;
  siteName: string;
  siteCode: string;
  name: string;
  externalGatewayId: string;
  status: string;
  deviceCount?: number;
  lastReceivedAt?: string | null;
  lastMeasuredAt?: string | null;
  currentProductionKw?: number | null;
  lastSeenAt?: string | null;
  pollingIntervalSeconds?: number;
  subscriptionTopic?: string;
  desiredVersion: number | null;
  publishedVersion: number | null;
  acknowledgedVersion: number | null;
  appliedVersion: number | null;
}

export type GatewayTab = 'all' | 'connected' | 'unconnected';

export interface DisplayGatewayItem {
  id: string;
  name: string;
  externalGatewayId: string;
  siteName: string;
  siteCode: string;
  status: string;
  deviceCount: number;
  currentProductionKw: number | null;
  lastReceivedAt: string | null;
  isDiscovered: boolean;
  discoveredRow?: DiscoveredGatewayRow;
  originalRow?: GatewayRow;
}

const canonicalStatus = (val?: string) =>
  val === 'online' || val === 'ออนไลน์'
    ? 'online'
    : val === 'offline' || val === 'ออฟไลน์'
    ? 'offline'
    : val || '';

export function GatewayIndex({
  rows,
  discoveredRows = [],
  locale,
  onSelect,
  onViewDetail,
  onPairDiscovered,
}: {
  rows: GatewayRow[];
  discoveredRows?: DiscoveredGatewayRow[];
  locale: string;
  onSelect: (row: GatewayRow) => void;
  onViewDetail?: (row: GatewayRow) => void;
  onPairDiscovered?: (row: DiscoveredGatewayRow) => void;
}) {
  const th = locale === 'th';
  const [activeTab, setActiveTab] = useState<GatewayTab>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  // Unified items
  const connectedItems: DisplayGatewayItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    externalGatewayId: r.externalGatewayId,
    siteName: r.siteName,
    siteCode: r.siteCode,
    status: r.status,
    deviceCount: r.deviceCount ?? 0,
    currentProductionKw: r.currentProductionKw ?? null,
    lastReceivedAt: r.lastReceivedAt ?? null,
    isDiscovered: false,
    originalRow: r,
  }));

  const unconnectedItems: DisplayGatewayItem[] = discoveredRows.map((d) => ({
    id: d.id,
    name: d.model ? `${d.model} (${d.externalGatewayId})` : `Gateway ${d.externalGatewayId}`,
    externalGatewayId: d.externalGatewayId,
    siteName: d.reportedSiteId ? `${th ? 'ไซต์ที่ระบุ' : 'Reported'}: ${d.reportedSiteId}` : th ? 'ยังไม่เชื่อมต่อไซต์' : 'Unassigned site',
    siteCode: d.reportedSiteId || '—',
    status: 'unconnected',
    deviceCount: d.reportedDeviceId ? 1 : 0,
    currentProductionKw: null,
    lastReceivedAt: d.lastSeenAt,
    isDiscovered: true,
    discoveredRow: d,
  }));

  const baseItems =
    activeTab === 'connected'
      ? connectedItems
      : activeTab === 'unconnected'
      ? unconnectedItems
      : [...connectedItems, ...unconnectedItems];

  const filtered = baseItems.filter((item) => {
    const matchesStatus =
      status === 'all' ||
      (status === 'unconnected' && item.isDiscovered) ||
      (!item.isDiscovered && canonicalStatus(item.status) === status);
    const query = `${item.name} ${item.externalGatewayId} ${item.siteName} ${item.siteCode}`.toLocaleLowerCase();
    return matchesStatus && query.includes(search.trim().toLocaleLowerCase());
  });

  const badge = (item: DisplayGatewayItem) => {
    if (item.isDiscovered || item.status === 'unconnected') {
      return (
        <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400">
          {th ? 'ยังไม่เชื่อมต่อ' : 'Not connected'}
        </span>
      );
    }
    const cStatus = canonicalStatus(item.status);
    return (
      <span
        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
          cStatus === 'online'
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : cStatus === 'offline'
            ? 'bg-red-500/10 text-red-700 dark:text-red-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {cStatus === 'online'
          ? th
            ? 'ออนไลน์'
            : 'Online'
          : cStatus === 'offline'
          ? th
            ? 'ออฟไลน์'
            : 'Offline'
          : item.status}
      </span>
    );
  };

  const received = (item: DisplayGatewayItem) => (
    <span title={item.lastReceivedAt ? formatAppDateTime(item.lastReceivedAt, th ? 'th' : 'en') : undefined}>
      <TelemetryAgeLabel value={item.lastReceivedAt} locale={locale} />
    </span>
  );

  const power = (item: DisplayGatewayItem) =>
    item.currentProductionKw == null
      ? '—'
      : `${Number(item.currentProductionKw).toLocaleString(th ? 'th-TH' : 'en-US', {
          maximumFractionDigits: 2,
        })} kW`;

  const actions = (item: DisplayGatewayItem) => {
    if (item.isDiscovered && item.discoveredRow) {
      return (
        <Button
          size="sm"
          variant="outline"
          className="text-xs font-medium border-primary/40 hover:bg-primary/10 hover:text-primary whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            onPairDiscovered?.(item.discoveredRow!);
          }}
        >
          {th ? 'เชื่อมต่อไซต์งาน' : 'Pair site'}
        </Button>
      );
    }
    if (!item.originalRow) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${th ? 'การจัดการเกตเวย์' : 'Gateway actions'}: ${item.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onViewDetail?.(item.originalRow!)}>
            {th ? 'ดูรายละเอียด' : 'View details'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSelect(item.originalRow!)}>
            {th ? 'ตั้งค่าเกตเวย์' : 'Configure gateway'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const handleRowClick = (item: DisplayGatewayItem) => {
    if (item.isDiscovered && item.discoveredRow) {
      onPairDiscovered?.(item.discoveredRow);
    } else if (item.originalRow) {
      onViewDetail?.(item.originalRow);
    }
  };

  const columns: ColumnDef<DisplayGatewayItem>[] = [
    { accessorKey: 'name', header: th ? 'เกตเวย์' : 'Gateway' },
    {
      accessorKey: 'externalGatewayId',
      size: 160,
      minSize: 130,
      header: th ? 'รหัสเกตเวย์' : 'Gateway code',
      cell: ({ row }) => <span className="whitespace-normal break-all">{row.original.externalGatewayId}</span>,
    },
    {
      accessorKey: 'siteName',
      header: th ? 'ไซต์งาน' : 'Site',
      cell: ({ row }) => (
        <span className="whitespace-normal">
          {row.original.siteName} {row.original.siteCode !== '—' && !row.original.siteName.includes(row.original.siteCode) ? `· ${row.original.siteCode}` : ''}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      size: 110,
      minSize: 95,
      maxSize: 125,
      header: th ? 'สถานะ' : 'Status',
      cell: ({ row }) => badge(row.original),
    },
    {
      accessorKey: 'deviceCount',
      size: 80,
      minSize: 70,
      maxSize: 90,
      header: th ? 'อุปกรณ์' : 'Devices',
      cell: ({ row }) => row.original.deviceCount ?? 0,
    },
    {
      accessorKey: 'currentProductionKw',
      size: 110,
      minSize: 100,
      maxSize: 120,
      header: th ? 'กำลังผลิต' : 'Production power',
      cell: ({ row }) => power(row.original),
    },
    {
      accessorKey: 'lastReceivedAt',
      size: 140,
      minSize: 130,
      maxSize: 160,
      header: th ? 'รับข้อมูลล่าสุด' : 'Last received',
      cell: ({ row }) => received(row.original),
    },
    {
      id: 'actions',
      size: 80,
      minSize: 60,
      maxSize: 120,
      header: '',
      enableSorting: false,
      cell: ({ row }) => actions(row.original),
    },
  ];

  return (
    <section className="space-y-4">
      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          className="w-full sm:max-w-xs text-base md:text-sm"
          aria-label={th ? 'ค้นหาเกตเวย์' : 'Search gateways'}
          placeholder={th ? 'ค้นหาเกตเวย์' : 'Search gateways'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <ChoiceSelect
            className="w-[160px] max-w-full text-base md:text-sm"
            aria-label={th ? 'สถานะเกตเวย์' : 'Gateway status'}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">{th ? 'ทุกสถานะ' : 'All statuses'}</option>
            <option value="online">{th ? 'ออนไลน์' : 'Online'}</option>
            <option value="offline">{th ? 'ออฟไลน์' : 'Offline'}</option>
            {activeTab === 'all' && (
              <option value="unconnected">{th ? 'ยังไม่เชื่อมต่อ' : 'Not connected'}</option>
            )}
          </ChoiceSelect>
        </div>
      </div>

      {/* 3 Status Tabs: All, Connected, Unconnected (Below Search Box) */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as GatewayTab)}
        className="min-w-0"
      >
        <TabsList
          aria-label={th ? 'สถานะการเชื่อมต่อเกตเวย์' : 'Gateway connection status'}
          className="h-auto w-full justify-start overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none"
        >
          <TabsTrigger
            value="all"
            className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold transition-colors shadow-none"
          >
            {th ? 'ทั้งหมด' : 'All'}
            <Badge
              variant="secondary"
              className={cn(
                'ml-1 text-[10px] h-5 px-1.5 rounded-full font-bold transition-colors',
                activeTab === 'all'
                  ? 'bg-neutral-950 text-white border-0'
                  : 'bg-muted text-foreground border border-border/70'
              )}
            >
              {rows.length + discoveredRows.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="connected"
            className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold transition-colors shadow-none"
          >
            {th ? 'เชื่อมต่อแล้ว' : 'Connected'}
            <Badge
              variant="secondary"
              className={cn(
                'ml-1 text-[10px] h-5 px-1.5 rounded-full font-bold transition-colors',
                activeTab === 'connected'
                  ? 'bg-neutral-950 text-white border-0'
                  : 'bg-muted text-foreground border border-border/70'
              )}
            >
              {rows.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="unconnected"
            className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold transition-colors shadow-none"
          >
            {th ? 'ยังไม่เชื่อมต่อ' : 'Not connected'}
            <Badge
              variant="secondary"
              className={cn(
                'ml-1 text-[10px] h-5 px-1.5 rounded-full font-bold transition-colors',
                activeTab === 'unconnected'
                  ? 'bg-neutral-950 text-white border-0'
                  : 'bg-muted text-foreground border border-border/70'
              )}
            >
              {discoveredRows.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Desktop Table */}
      <div className="hidden md:block [&_table]:table-fixed [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:break-words">
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          onRowClick={handleRowClick}
          hideSearch
        />
      </div>

      {/* Mobile Card List */}
      <div className="space-y-3 md:hidden">
        {filtered.map((item) => (
          <article
            key={item.id}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRowClick(item);
              }
            }}
            className="cursor-pointer rounded-xl border bg-card p-4 space-y-3 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (
                target.closest(
                  'button, a, input, select, [role=menuitem], [data-slot=dropdown-menu-trigger]'
                )
              )
                return;
              handleRowClick(item);
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium hover:underline">{item.name}</h2>
              {actions(item)}
            </div>
            <p className="text-sm">
              {item.externalGatewayId} · {item.siteName}
            </p>
            {badge(item)}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>{th ? 'อุปกรณ์' : 'Devices'}</dt>
              <dd>{item.deviceCount ?? 0}</dd>
              <dt>{th ? 'กำลังผลิต' : 'Production power'}</dt>
              <dd>{power(item)}</dd>
              <dt>{th ? 'รับข้อมูลล่าสุด' : 'Last received'}</dt>
              <dd>{received(item)}</dd>
            </dl>
          </article>
        ))}
        {!filtered.length && (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            {th ? 'ไม่พบเกตเวย์' : 'No gateways found'}
          </p>
        )}
      </div>
    </section>
  );
}
