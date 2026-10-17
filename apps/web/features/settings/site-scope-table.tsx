'use client';

import * as React from 'react';
import { Database } from 'lucide-react';
import { useLocale } from '../../providers/locale-provider';
import { SearchInput } from '../../components/ui/search-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../components/ui/empty';

export type Scope = { mode: 'all' | 'selected'; siteIds: string[] };

export function SiteScopeTable({
  sites,
  scope,
  search,
  onSearch,
  onChange,
  hideSearch = false,
}: {
  sites: { id: string; name: string }[];
  scope: Scope;
  search: string;
  onSearch: (value: string) => void;
  onChange: (scope: Scope) => void;
  hideSearch?: boolean;
}) {
  const th = useLocale() === 'th';
  const term = search.trim().toLocaleLowerCase();
  const visible = sites.filter((site) => site.name.toLocaleLowerCase().includes(term));
  return (
    <div className="space-y-3">
      {!hideSearch && (
        <SearchInput
          aria-label={th ? 'ค้นหาไซต์' : 'Search sites'}
          placeholder={th ? 'ค้นหาไซต์' : 'Search sites'}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      )}
      <p className="text-sm text-muted-foreground">
        {th ? 'ไซต์ที่เลือก' : 'Selected sites'}: {scope.siteIds.length}
      </p>
      <div className="max-h-64 overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{th ? 'เลือก' : 'Select'}</TableHead>
              <TableHead>{th ? 'ไซต์งาน' : 'Site'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((site) => (
              <TableRow key={site.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={(th ? 'เลือกไซต์ ' : 'Select site ') + site.name}
                    checked={scope.siteIds.includes(site.id)}
                    onChange={(e) =>
                      onChange({
                        ...scope,
                        siteIds: e.target.checked
                          ? [...scope.siteIds, site.id]
                          : scope.siteIds.filter((id) => id !== site.id),
                      })
                    }
                  />
                </TableCell>
                <TableCell>{site.name}</TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={2} className="h-44 text-center">
                  <Empty className="py-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Database className="size-5 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>{th ? 'ไม่พบไซต์' : 'No sites found'}</EmptyTitle>
                      <EmptyDescription>
                        {search.trim()
                          ? (th ? 'ไม่พบข้อมูลไซต์ที่ตรงกับคำค้นหา' : 'No sites match your search keyword')
                          : (th ? 'ยังไม่มีไซต์ในระบบ' : 'No sites available')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
