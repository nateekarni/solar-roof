'use client';

import * as React from 'react';
import {
  ACTIVE_DISPLAY_RESOURCES,
  resourceLabel,
  isActionValidForResource,
  type RuleValue,
} from './staff-permissions-model';
import { useLocale } from '../../providers/locale-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Checkbox } from '../../components/ui/checkbox';

export type Domain = 'business' | 'technical';

export function RuleMatrix({
  domain,
  permissions,
  rules = {},
  overrides = {},
  onChange,
  disabled = false,
}: {
  domain?: Domain;
  permissions: string[];
  rules?: Record<string, RuleValue>;
  overrides?: Record<string, RuleValue>;
  onChange: (permission: string, value: boolean) => void;
  inherit?: boolean;
  disabled?: boolean;
}) {
  const th = useLocale() === 'th';
  const effectiveDomain = domain ?? (permissions.some((p) => p.startsWith('technical.')) ? 'technical' : 'business');
  const activeResources = ACTIVE_DISPLAY_RESOURCES[effectiveDomain];
  const allGroups = [...new Set(permissions.map((p) => p.split('.')[1]!))];
  const groups = allGroups.filter((g) => activeResources.includes(g));
  const actions = ['view', 'edit', 'approve', 'download'] as const;
  const actionLabels = th ? ['ดู', 'แก้ไข', 'อนุมัติ', 'ดาวน์โหลด'] : ['View', 'Edit', 'Approve', 'Download'];

  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px] sm:w-[220px] font-semibold">{th ? 'งาน' : 'Resource'}</TableHead>
            {actionLabels.map((label) => (
              <TableHead key={label} className="w-24 text-center font-semibold">
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const resName = resourceLabel(group, effectiveDomain, th ? 'th' : 'en');
            return (
              <TableRow key={group} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-medium text-foreground">{resName}</TableCell>
                {actions.map((action, index) => {
                  const isValid = isActionValidForResource(group, action);
                  const permission = permissions.find((p) => p.endsWith('.' + group + '.' + action));

                  if (!isValid || !permission) {
                    return (
                      <TableCell key={action} className="text-center">
                        <span className="font-medium text-muted-foreground/30 select-none">—</span>
                      </TableCell>
                    );
                  }

                  const isChecked = overrides[permission] === true || (overrides[permission] == null && rules[permission] === true);

                  return (
                    <TableCell key={action} className="text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          id={`perm-${permission}`}
                          aria-label={`${resName} ${actionLabels[index]}`}
                          checked={isChecked}
                          disabled={disabled}
                          onCheckedChange={(checked) => onChange(permission, Boolean(checked))}
                        />
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
