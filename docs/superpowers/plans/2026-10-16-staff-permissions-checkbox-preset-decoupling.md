# Staff Permissions Checkbox Grid & Position Preset Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the staff permission management UI from 3-state dropdowns to explicit Shadcn Checkboxes (Allow/Deny), hide inapplicable action columns per resource with a clean centered dash (`—`), and decouple positions so that modifying a position preset never alters permissions of existing employees.

**Architecture:**
- Define `RESOURCE_VALID_ACTIONS` specifying the exact operational actions (`view`, `edit`, `approve`, `download`) supported by each business and technical resource.
- Refactor `RuleMatrix` to render `<Checkbox>` for valid actions and `—` for unsupported actions, eliminating confusing 3-state dropdowns and redundant "มีสิทธิ์ / ไม่มีสิทธิ์" badges.
- Decouple positions from existing employees by treating positions strictly as auto-select presets. When an employee is saved, concrete booleans for each permission are persisted in `overrides`, ensuring that future edits to a position's preset never cascade or mutate existing employees' access.
- In `PositionEditor`, streamline preset saving directly without unnecessary impact warnings since presets do not mutate existing staff.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Tailwind CSS, Radix UI Checkbox, Node.js test runner (`node:test`).

**Spec:** User clarification in chat: "คือระบบควรมีแค่อนุญาต/ไม่อนุญาต และถ้ารายการหรือจุดไหนไม่มีคอลัมน์ไหนก็ไม่ต้องแสดง checkbox ให้เป็นการตั้งค่าตรงตัวไปเลย จะได้รู้ว่าส่วนไหนทำอะไรได้บ้าง และจะได้ให้สิทธิ์ถูกตามความต้องการจริง และถ้ากรณีมีการแก้ไขตำแหน่งต้องไม่กระทบกับคนที่เลือกตำแหน่งนี้ไปก่อนหน้านี้แล้ว เพราะเป็นแค่การ auto-select preset ให้เฉยๆ"

## Global Constraints
- Preserve bilingual English/Thai labels.
- Only show checkboxes for actions that actually exist for each resource.
- Checkbox checked = Allow (`true`), unchecked = Deny (`false`).
- Modifying a position preset MUST NOT alter permissions of existing employees who previously chose that position.
- Existing tests in `staff-permissions-model.spec.ts` and web suite must continue to pass.

---

### Task 1: Define Valid Actions Mapping and Update Staff Permissions Model

**Files:**
- Modify: `apps/web/features/settings/staff-permissions-model.ts`
- Modify: `apps/web/features/settings/staff-permissions-model.spec.ts`

**Interfaces:**
- Produces:
  - `RESOURCE_VALID_ACTIONS: Record<string, readonly ('view' | 'edit' | 'approve' | 'download')[]>`
  - Helper functions for snapshotting and applying position presets

- [ ] **Step 1: Write failing tests for `RESOURCE_VALID_ACTIONS` and snapshotting in `staff-permissions-model.spec.ts`**

Add tests to `apps/web/features/settings/staff-permissions-model.spec.ts`:
```typescript
test('RESOURCE_VALID_ACTIONS contains valid actions for business and technical resources', () => {
  assert.deepEqual(model.RESOURCE_VALID_ACTIONS.dashboard, ['view']);
  assert.deepEqual(model.RESOURCE_VALID_ACTIONS.billing, ['view', 'edit', 'approve', 'download']);
  assert.deepEqual(model.RESOURCE_VALID_ACTIONS.gateways, ['view', 'edit']);
  assert.deepEqual(model.RESOURCE_VALID_ACTIONS.audit, ['view', 'download']);
});

test('applyPositionPreset copies position rules to concrete booleans for all domain permissions', () => {
  const permissions = ['business.billing.view', 'business.billing.approve', 'business.billing.edit'];
  const presetRules = { 'business.billing.view': true };
  const result = model.applyPositionPreset('business', permissions, presetRules);
  assert.deepEqual(result, {
    'business.billing.view': true,
    'business.billing.approve': false,
    'business.billing.edit': false,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test` or `node --test apps/web/features/settings/staff-permissions-model.spec.ts`
Expected: FAIL with `RESOURCE_VALID_ACTIONS is undefined` or `applyPositionPreset is not a function`.

- [ ] **Step 3: Implement `RESOURCE_VALID_ACTIONS` and helpers in `staff-permissions-model.ts`**

In `apps/web/features/settings/staff-permissions-model.ts`:
```typescript
export const RESOURCE_VALID_ACTIONS: Record<string, readonly ('view' | 'edit' | 'approve' | 'download')[]> = {
  // Business domain
  dashboard: ['view'],
  sites: ['view', 'edit'],
  customers: ['view', 'edit'],
  billing: ['view', 'edit', 'approve', 'download'],
  receipts: ['view', 'edit', 'approve', 'download'],
  documents: ['view', 'edit', 'download'],
  tariffs: ['view', 'edit'],
  settings: ['view', 'edit'],
  audit: ['view', 'download'],

  // Technical domain
  gateways: ['view', 'edit'],
  devices: ['view', 'edit'],
  fields: ['view', 'edit'],
  profiles: ['view', 'edit'],
  registers: ['view', 'edit'],
  reception: ['view', 'edit'],
  brokers: ['view', 'edit'],
  alerts: ['view', 'edit'],
  telemetry: ['view', 'download'],
};

export function isActionValidForResource(resource: string, action: string): boolean {
  const actions = RESOURCE_VALID_ACTIONS[resource];
  return actions ? actions.includes(action as any) : false;
}

export function applyPositionPreset(
  domain: string,
  permissions: readonly string[],
  presetRules: Record<string, RuleValue>
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const p of permissions.filter((perm) => perm.startsWith(domain + '.'))) {
    result[p] = presetRules[p] === true;
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test apps/web/features/settings/staff-permissions-model.spec.ts`
Expected: PASS.

---

### Task 2: Refactor `RuleMatrix` Component to Use Checkbox Grid and Hide Nonexistent Columns

**Files:**
- Modify: `apps/web/features/settings/staff-permissions-workspace.tsx`

**Interfaces:**
- Updates `RuleMatrix` props:
  - `permissions: string[]`
  - `rules?: Record<string, RuleValue>`
  - `overrides?: Record<string, RuleValue>`
  - `onChange: (permission: string, value: boolean) => void`
  - `disabled?: boolean`
- Renders:
  - Table with 5 columns: Resource, View, Edit, Approve, Download
  - Checkbox with `CheckboxPrimitive.Root` from `../../components/ui/checkbox` for valid actions
  - Centered dash `—` for non-applicable actions
  - Full keyboard accessibility and clear `aria-label`

- [ ] **Step 1: Update `RuleMatrix` in `apps/web/features/settings/staff-permissions-workspace.tsx`**

Replace the `<ChoiceSelect>` dropdown in `RuleMatrix` with Shadcn `<Checkbox>`:
```tsx
import { Checkbox } from '../../components/ui/checkbox';
import { RESOURCE_VALID_ACTIONS, isActionValidForResource } from './staff-permissions-model';

export function RuleMatrix({
  permissions,
  rules = {},
  overrides = {},
  onChange,
  disabled = false,
}: {
  permissions: string[];
  rules?: Record<string, RuleValue>;
  overrides?: Record<string, RuleValue>;
  onChange: (permission: string, value: boolean) => void;
  inherit?: boolean;
  disabled?: boolean;
}) {
  const th = useLocale() === 'th';
  const groups = [...new Set(permissions.map((p) => p.split('.')[1]!))];
  const actions = ['view', 'edit', 'approve', 'download'] as const;
  const actionLabels = th ? ['ดู', 'แก้ไข', 'อนุมัติ', 'ดาวน์โหลด'] : ['View', 'Edit', 'Approve', 'Download'];
  const resourceLabels: Record<string, [string, string]> = {
    dashboard: ['ภาพรวม', 'Dashboard'],
    sites: ['ไซต์งาน', 'Sites'],
    customers: ['ลูกค้า', 'Customers'],
    billing: ['ใบวางบิล', 'Billing'],
    receipts: ['ใบเสร็จ', 'Receipts'],
    documents: ['เอกสาร', 'Documents'],
    tariffs: ['อัตราค่าไฟ', 'Tariffs'],
    settings: ['ตั้งค่า', 'Settings'],
    audit: ['ประวัติ', 'Audit'],
    gateways: ['เกตเวย์', 'Gateways'],
    devices: ['อุปกรณ์', 'Devices'],
    fields: ['รายการข้อมูล', 'Fields'],
    profiles: ['โปรไฟล์', 'Profiles'],
    registers: ['รีจิสเตอร์', 'Registers'],
    reception: ['การรับข้อมูล', 'Reception'],
    brokers: ['การเชื่อมต่อ', 'Brokers'],
    alerts: ['การแจ้งเตือน', 'Alerts'],
    telemetry: ['ข้อมูลเทคนิค', 'Telemetry'],
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px] sm:w-[220px]">{th ? 'งาน' : 'Resource'}</TableHead>
            {actionLabels.map((label) => (
              <TableHead key={label} className="w-24 text-center">
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const resName = resourceLabels[group]?.[th ? 0 : 1] ?? group;
            return (
              <TableRow key={group}>
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
```

- [ ] **Step 2: Run `pnpm --filter web test` to verify no compilation/rendering breakages**

Run: `pnpm --filter web test`
Expected: PASS.

---

### Task 3: Decouple Position Presets & Snapshot Permissions in `EmployeeEditor` and `PositionEditor`

**Files:**
- Modify: `apps/web/features/settings/staff-permissions-workspace.tsx`
- Modify: `apps/web/test/platform/staff-position.browser.test.mjs` (if browser test selector needs update)

**Interfaces:**
- `EmployeeEditor`:
  - When mounting, loads full snapshot of domain permissions as concrete booleans in `overrides`.
  - When choosing a position preset via `PositionCombobox`, automatically populates `overrides` with that position's rules.
  - Adds a "ใช้สิทธิ์ตามตำแหน่ง" / "Reset to position preset" button so users can re-apply the position template at any time.
  - When saving, persists complete snapshot in `overrides`, ensuring future edits to the position preset do not affect this employee.
- `PositionEditor`:
  - Removes the 2-step impact check requirement; saving directly saves the preset rules.
  - Updates copy to make it clear that the position is a preset for future assignments.

- [ ] **Step 1: Implement snapshotting and preset selection in `EmployeeEditor`**

In `EmployeeEditor` in `staff-permissions-workspace.tsx`:
1. Initialize `overrides` state:
```typescript
const [overrides, setOverrides] = useState<Record<string, RuleValue>>(() => {
  const existingGrant = employee.grant;
  const initialPos = positions.find(
    (p) => p.id === (existingGrant?.positionId ?? employee.companyPositionId)
  );
  const initialRules = initialPos?.rules ?? {};
  const map: Record<string, RuleValue> = {};
  for (const perm of permissions.filter((p) => p.startsWith(domain + '.'))) {
    if (existingGrant?.overrides && existingGrant.overrides[perm] !== undefined && existingGrant.overrides[perm] !== null) {
      map[perm] = existingGrant.overrides[perm];
    } else {
      map[perm] = initialRules[perm] === true;
    }
  }
  return map;
});
```

2. When `choosePosition(next)` is called:
```typescript
const choosePosition = (next: PositionChoice) => {
  setChoice(next);
  if (next.kind === 'existing') {
    const pos = currentPositions.find((p) => p.id === next.id);
    const nextOverrides: Record<string, RuleValue> = { ...overrides };
    for (const p of permissions.filter((perm) => perm.startsWith(domain + '.'))) {
      nextOverrides[p] = pos?.rules[p] === true;
    }
    setOverrides(nextOverrides);
  } else if (next.kind === 'new') {
    setPermissionsConfigured(false);
  }
  setError('');
};
```

3. Add "ใช้สิทธิ์ตามตำแหน่ง" (Reset to position preset) button in the Permissions tab:
```tsx
<div className="flex flex-wrap items-center justify-between gap-2">
  <div>
    <h3 className="text-sm font-semibold">{th ? 'สิทธิ์การใช้งาน' : 'Access permissions'}</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {th
        ? 'เลือกสิทธิ์ที่อนุญาตให้พนักงานเข้าถึง (ติ๊กถูก = อนุญาต)'
        : 'Select permissions granted to this employee (checked = allowed)'}
    </p>
  </div>
  {choice?.kind === 'existing' && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const pos = currentPositions.find((p) => p.id === choice.id);
        const nextOverrides: Record<string, RuleValue> = { ...overrides };
        for (const p of permissions.filter((perm) => perm.startsWith(domain + '.'))) {
          nextOverrides[p] = pos?.rules[p] === true;
        }
        setOverrides(nextOverrides);
      }}
    >
      {th ? 'คืนค่าตามตำแหน่ง' : 'Reset to position preset'}
    </Button>
  )}
</div>
```

4. In `PositionEditor`, streamline direct save without impact modal:
```tsx
async function save(e: FormEvent) {
  e.preventDefault();
  setBusy(true);
  setError('');
  try {
    if (position.id) {
      await apiClient.patch(`/v1/team/positions/${position.id}/${domain}`, {
        revision: position.revision,
        name,
        rules: domainOverrides(domain, rules),
      });
    } else {
      await apiClient.post(`/v1/team/positions/${domain}`, {
        name,
        rules: domainOverrides(domain, rules),
      });
    }
    onSaved();
  } catch (e) {
    setError((e as Error).message);
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 2: Update browser test expectations in `staff-position.browser.test.mjs`**

Update `apps/web/test/platform/staff-position.browser.test.mjs` where it clicked dropdown comboboxes to interact with checkboxes instead (`getByRole('checkbox', { name: 'ใบวางบิล อนุมัติ' }).check()`).

- [ ] **Step 3: Run all unit and integration tests**

Run: `pnpm --filter web test` and `pnpm --filter @solar/api test`
Expected: All tests PASS.

- [ ] **Step 4: Run production build check**

Run: `pnpm turbo run build`
Expected: All packages compile cleanly with zero errors.

---

### Task 4: Visual & Interactive Verification

- [ ] **Step 1: Check live web app in browser**

Visit `http://localhost:3000/settings/users`.
1. Verify staff tabs: "พนักงาน" and "ตำแหน่งและสิทธิ์" on a dedicated row below filters.
2. Click "จัดการสิทธิ์" on an employee.
3. Switch to "สิทธิ์" tab:
   - Check that the table has checkboxes and `—` where actions are not applicable.
   - Verify that toggling a checkbox works immediately.
   - Verify that "คืนค่าตามตำแหน่ง" resets permissions to the selected position's preset.
4. Click "ตำแหน่งและสิทธิ์" tab:
   - Click "จัดการสิทธิ์" or "เพิ่มตำแหน่ง".
   - Verify that `PositionEditor` displays the same clean checkbox grid and saves directly.
