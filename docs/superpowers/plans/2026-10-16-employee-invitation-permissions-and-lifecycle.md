# Employee Invitation Permissions and Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate permission selection into the Add Employee workflow, support a freeform position Combobox that auto-applies presets without clearing on text edits, rename management actions to "แก้ไขข้อมูล (Edit details)", and implement complete lifecycle management (Deactivation with confirm modal, Reactivation, and Invitation Cancellation) across Owner and Admin.

**Architecture:**
1. Extend `POST /v1/users/invite` in `@solar/api` to accept `companyPosition`, `permissions` (overrides), and `scope`, inserting grants atomically into `employee_domain_grants`.
2. Expand `team.service.ts` to allow both Owner and Admin to deactivate employees, add a `reactivate` endpoint, support updating `displayName` in `saveEmployee`, and revoke outstanding invitations upon deactivation.
3. Build a freeform `PositionCombobox` supporting arbitrary text entry with preset suggestions that auto-select permissions in `RuleMatrix`.
4. Update `StaffInvitation` to a 2-tab modal (General Details + Permissions & Site Scope), and update `EmployeeEditor` to editable name/position with the "แก้ไขข้อมูล" title.
5. Add row-level actions with confirm modal for "ยกเลิกใช้งาน (Deactivate)", "เปิดใช้งานอีกครั้ง (Reactivate)", and "ยกเลิกคำเชิญ (Cancel Invitation)".

**Tech Stack:** Next.js (App Router), React 19, TypeScript, NestJS, PostgreSQL (`pg`), Tailwind CSS, Radix UI.

**Spec:** [docs/adr/0021-employee-invitation-permissions-and-lifecycle-decoupling.md](file:///d:/Dev/solar-roof/docs/adr/0021-employee-invitation-permissions-and-lifecycle-decoupling.md)

## Global Constraints
- Preserve bilingual English/Thai translations across all user-facing labels and toasts.
- Position names are freeform company titles and must not automatically mutate the master preset catalog.
- Permission grants are independent snapshots in `employee_domain_grants.overrides`.
- Account deactivation terminates active sessions and requires user confirmation.

---

### Task 1: Backend API Enhancements for Invitation Permissions and Employee Lifecycle

**Files:**
- Modify: `apps/api/src/modules/identity/invitation.service.ts`
- Modify: `apps/api/src/modules/identity/team.service.ts`
- Modify: `apps/api/src/modules/identity/team.controller.ts`
- Test: `apps/api/src/modules/identity/team.service.spec.ts`
- Test: `apps/api/test/platform/invitation.test.ts`

**Interfaces:**
- Consumes: `InviteInput` with `{ email, displayName, role?, companyPosition?, permissions?, scope? }`
- Produces: `POST /v1/users/invite` with grants, `POST /v1/team/employees/:id/reactivate`, `saveEmployee` accepting `displayName`

- [ ] **Step 1: Write failing test for invitation permissions, reactivation, and admin deactivation**

Add tests in `apps/api/src/modules/identity/team.service.spec.ts`:
```ts
test('reactivate restores inactive employee to active status', async () => {
  // Verifies POST /v1/team/employees/:id/reactivate sets status='active' and increments permission_revision
});
test('admin can deactivate and reactivate employee accounts', async () => {
  // Verifies technical manager (admin) can deactivate and reactivate operator accounts
});
test('saveEmployee updates displayName when provided', async () => {
  // Verifies updating employee profile saves new displayName
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @solar/api test`
Expected: FAIL with "reactivate is not a function"

- [ ] **Step 3: Implement backend methods in `invitation.service.ts` and `team.service.ts`**

In `invitation.service.ts`:
- Accept `permissions` and `scope` in `InviteInput`.
- When role is employee (`operator` or `accountant`), insert into `employee_domain_grants(user_id, domain, position_id, overrides, scope_mode, site_ids, updated_by)`.

In `team.service.ts`:
- In `deactivate`: Allow both `owner` and `admin` actors. When deactivating, also mark any pending `user_invitations` for that user as cancelled/consumed.
- Add `reactivate(actor: TeamActor, userId: string, input: unknown)`: Checks actor (`owner` or `admin`), sets `status='active'`, increments `permission_revision`, and logs audit event `employee.reactivated`.
- In `saveEmployee`: If `input.displayName` is provided, update `users.display_name = input.displayName.trim()`.

In `team.controller.ts`:
- Add `@Post('employees/:id/reactivate')` route.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @solar/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/identity/
git commit -m "feat(api): support invitation permissions, employee reactivation and admin deactivation"
```

---

### Task 2: Freeform Position Combobox and Staff Status Presentation

**Files:**
- Modify: `apps/web/features/settings/position-combobox.tsx`
- Modify: `apps/web/features/settings/staff-permissions-model.ts`
- Modify: `apps/web/features/settings/staff-permissions-model.spec.ts`

**Interfaces:**
- Consumes: `positions: readonly { id: string; name: string; rules?: Record<string, RuleValue> }[]`
- Produces: `FreeformPositionCombobox` accepting string value, `onChange: (value: string) => void`, and `onSelectPreset?: (preset: Position) => void`.

- [ ] **Step 1: Write failing test in `staff-permissions-model.spec.ts`**

Test helper functions for status labels ("ยกเลิกแล้ว", "คำเชิญหมดอายุ", "เปิดใช้งานอีกครั้ง") and preset matching.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL

- [ ] **Step 3: Implement `FreeformPositionCombobox` and status labels**

In `apps/web/features/settings/position-combobox.tsx`:
- Render an editable text input with a popover trigger / command menu.
- As the user types, `onChange(text)` is fired with the typed string.
- The command list shows matching existing positions.
- When an item is selected from the list, `onChange(preset.name)` is fired, and if `onSelectPreset` is passed, `onSelectPreset(preset)` is invoked so the parent can auto-apply the permissions preset.
- Updating text manually does not clear previously selected permissions.

In `apps/web/features/settings/staff-permissions-model.ts`:
- Update `staffStatusLabel` to map `inactive` to `['ยกเลิกแล้ว', 'Inactive']`, `cancelled` to `['ยกเลิกแล้ว', 'Cancelled']`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/settings/position-combobox.tsx apps/web/features/settings/staff-permissions-model.ts apps/web/features/settings/staff-permissions-model.spec.ts
git commit -m "feat(web): add freeform position combobox and updated status labels"
```

---

### Task 3: Comprehensive "เพิ่มพนักงาน (StaffInvitation)" Modal with Permissions & Site Scope

**Files:**
- Modify: `apps/web/features/settings/staff-permissions-workspace.tsx`

**Interfaces:**
- Consumes: `domain`, `positions`, `permissions`, `sites`, `onSaved`, `onClose`
- Produces: 2-tab `StaffInvitation` dialog:
  - Tab 1 "ข้อมูลทั่วไป": Name, Email, Freeform Position Combobox
  - Tab 2 "สิทธิ์การใช้งานและไซต์": Checkbox `RuleMatrix`, Site scope table

- [ ] **Step 1: Write integration/unit test verifying `StaffInvitation` draft state and submission**

Verify that:
1. Selecting an existing preset populates the `RuleMatrix` checkboxes.
2. Typing additional text in the position input does not wipe the populated checkboxes.
3. Submitting calls `apiClient.post('/v1/users/invite', { email, displayName, companyPosition, permissions, scope })`.

- [ ] **Step 2: Update `StaffInvitation` in `staff-permissions-workspace.tsx`**

- Enlarge dialog to `sm:max-w-5xl`.
- Add 2 tabs: "ข้อมูลทั่วไป (General Details)" and "สิทธิ์การใช้งานและไซต์ (Permissions & Site Scope)".
- Use `FreeformPositionCombobox` for position.
- Bind `onSelectPreset` to copy the preset's rules into the local permissions state.
- Include `RuleMatrix` and `SiteScopeTable`.
- Submit payload with `email`, `displayName`, `companyPosition`, `permissions: snapshotOverrides`, and `scope`.

- [ ] **Step 3: Run test suite**

Run: `pnpm --filter web test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/settings/staff-permissions-workspace.tsx
git commit -m "feat(web): support 2-tab Add Employee modal with permissions and site scope"
```

---

### Task 4: Rename "จัดการสิทธิ์" to "แก้ไขข้อมูล", Editable Display Name, and Deactivate/Reactivate Row Actions

**Files:**
- Modify: `apps/web/features/settings/staff-permissions-workspace.tsx`

**Interfaces:**
- Consumes: Employee list, action menu callbacks
- Produces:
  - Table action menu: "แก้ไขข้อมูล (Edit details)", "ยกเลิกใช้งาน (Deactivate)" with confirm modal, "เปิดใช้งานอีกครั้ง (Reactivate)" for inactive employees.
  - `EmployeeEditor` with title "แก้ไขข้อมูลพนักงาน", editable `displayName` and position.

- [ ] **Step 1: Write tests for action menus and confirm modal**

Verify:
1. Active employee menu has "แก้ไขข้อมูล" and "ยกเลิกใช้งาน".
2. Clicking "ยกเลิกใช้งาน" opens confirmation modal with impact preview before sending deactivation request.
3. Inactive employee menu has "เปิดใช้งานอีกครั้ง" which calls `/v1/team/employees/:id/reactivate`.
4. `EmployeeEditor` sends updated `displayName` to the API.

- [ ] **Step 2: Implement UI updates in `staff-permissions-workspace.tsx`**

- In employee columns `employeeActions`:
  - Change "จัดการสิทธิ์" to "แก้ไขข้อมูล".
  - If `employee.status === 'active'`: add "ยกเลิกใช้งาน" (destructive). When clicked, open `DeactivateConfirmDialog` showing impact (`deactivation-impact`) and confirmation.
  - If `employee.status === 'inactive'`: add "เปิดใช้งานอีกครั้ง" (Reactivate), calling `apiClient.post('/v1/team/employees/${employee.id}/reactivate')`.
  - If `employee.status === 'invited'`: add "ยกเลิกคำเชิญ" (Cancel Invitation), confirming and calling deactivation/cancel.
- In `EmployeeEditor`:
  - Change title to "แก้ไขข้อมูลพนักงาน (Edit employee details)".
  - Replace read-only display name with an editable `<Input>` for Name.
  - Use `FreeformPositionCombobox` for position.
  - Submit sends `displayName` to API.

- [ ] **Step 3: Run test suite and production build**

Run: `pnpm --filter web test` and `pnpm --filter web build`
Expected: PASS 100%

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/settings/staff-permissions-workspace.tsx
git commit -m "feat(web): update employee editing, deactivation modal, and reactivation flow"
```

---

### Task 5: End-to-End Verification and Documentation

**Files:**
- Modify: `CONTEXT.md`
- Verify: Next.js dev server on `http://localhost:3000/settings/users`

- [ ] **Step 1: Verify all unit and integration tests pass**

Run: `pnpm test` across all workspaces.

- [ ] **Step 2: Manual browser test verification**

Verify:
1. Open "เพิ่มพนักงาน" -> 2 tabs appear.
2. Type custom position -> stays custom.
3. Select preset from dropdown -> checkboxes auto-fill.
4. Edit position text to custom -> checkboxes remain intact!
5. Select sites and submit -> employee created with permissions and position.
6. Click 3-dots on employee -> "แก้ไขข้อมูล" and "ยกเลิกใช้งาน" appear.
7. Click "ยกเลิกใช้งาน" -> confirmation dialog opens, confirms, status becomes "ยกเลิกแล้ว".
8. Click 3-dots on inactive employee -> "เปิดใช้งานอีกครั้ง" appears, click to reactivate -> status returns to "ใช้งาน".

- [ ] **Step 3: Commit final plan execution and documentation**

```bash
git commit --allow-empty -m "chore: complete employee invitation permissions and lifecycle implementation"
```
