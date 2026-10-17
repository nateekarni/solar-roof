# Preset Editor Redesign & Register Address Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Preset Editor modal (`PresetEditor`) by removing complex collapsible accordions, organizing all essential device and preset configurations into a clean, consistent form, and adding direct Register Address mapping support for all data fields across frontend and backend schemas.

**Architecture:** Extend the `PayloadField` contract to include optional `registerAddress?: string` across the API validation schema (`payload-profile.ts`) and web type definitions. Redesign `PresetEditor` using standard `<FieldGroup>` and `<Field>` components adhering to ADR-0009 and ADR-0020, replacing `<details>` accordions with an explicit, organized layout. Update `PayloadFieldsEditor` and `DeviceFieldsTable` to present Register Address directly in the field table and JSON views.

**Tech Stack:** Next.js (React 19), NestJS, TypeScript, Zod, Tailwind CSS, shadcn/ui.

**Spec:** User request 2026-10-16: Refactor Preset Modal, remove advanced toggle, provide complete essential config, and add Register Address to each field.

## Global Constraints

- Preserve backward compatibility for all existing presets in database (`PayloadProfile` schema 1.1).
- `registerAddress` must be optional (`min(1).max(128)`).
- All input fields must adhere to the 8px (`gap-2`) label-to-input vertical rhythm and `h-10` height.
- All existing 467 web tests and 672 API tests must continue to pass without regression.

---

### Task 1: Extend Payload Field Contracts & API Validation Schema

**Files:**
- Modify: `apps/api/src/modules/telemetry/payload-profile.ts:8-12`
- Modify: `apps/web/features/sites/payload-contracts.ts:1-6`
- Modify: `apps/web/features/shared/payload-fields-json.ts:9-16`
- Test: `apps/api/src/modules/telemetry/payload-profile.spec.ts`

**Interfaces:**
- `PayloadField`:
  ```ts
  export interface PayloadField {
    tag: string;
    displayName: string;
    pollGroup: string;
    sourceUnit: string;
    targetUnit: string;
    conversion: 'identity' | 'wh-to-kwh' | 'varh-to-kvarh' | 'auto-v1';
    role?: 'billing-import' | 'active-power' | 'none';
    sourceTag?: string;
    required?: boolean;
    registerAddress?: string;
  }
  ```
- `fieldSchema` in `payload-profile.ts`:
  ```ts
  const fieldSchema = z.object({
    tag,
    sourceTag: tag.optional(),
    required: z.boolean().optional(),
    displayName: z.string().min(1).max(128),
    pollGroup: identifier,
    sourceUnit: unit,
    targetUnit: unit,
    conversion: z.enum(["identity", "wh-to-kwh", "varh-to-kvarh", "auto-v1"]),
    role: z.enum(["billing-import", "active-power", "none"]).optional(),
    registerAddress: z.string().min(1).max(128).optional(),
  }).strict();
  ```

- [ ] **Step 1: Write test for registerAddress validation in payload-profile.spec.ts**
- [ ] **Step 2: Update `fieldSchema` in `payload-profile.ts` with `registerAddress`**
- [ ] **Step 3: Update `PayloadField` in `apps/web/features/sites/payload-contracts.ts`**
- [ ] **Step 4: Update `parsePayloadFieldsJson` in `payload-fields-json.ts` to allow `registerAddress`**
- [ ] **Step 5: Run tests `pnpm --filter @solar/api test` and verify passing**

---

### Task 2: Add Register Address Column to Field Editors & Tables

**Files:**
- Modify: `apps/web/features/shared/payload-fields-editor.tsx:25-47`
- Modify: `apps/web/features/sites/device-profile-editor.tsx:18-20,74-76`

**Interfaces:**
- `PayloadFieldsEditor`: Add `registerAddress` to `keys`, `labels`, and render an `<Input>` column in table view and field dialog.
- `DeviceFieldsTable`: Display `Register Address` column in the data table when present.

- [ ] **Step 1: Add Register Address column to `PayloadFieldsEditor` table header and row inputs**
- [ ] **Step 2: Add Register Address input in single-field edit modal (`device-profile-editor.tsx`)**
- [ ] **Step 3: Add Register Address column in `DeviceFieldsTable`**
- [ ] **Step 4: Test table rendering and JSON sync in `DeviceProfileEditor`**

---

### Task 3: Redesign `PresetEditor` Modal Layout

**Files:**
- Modify: `apps/web/features/sites/preset-editor.tsx:1-25`
- Test: `apps/web/features/sites/preset-editor.spec.tsx`

**Description:**
Replace the `<details>` accordions in `PresetEditor` with a structured, cohesive form layout:
1. **Header Section:** Preset Name, Preset ID, Mapping Version, Device Type (`energy-meter`, `solar-logger`, etc.).
2. **Device Hardware Info:** Model, Brand, and Default Poll Groups.
3. **Data Fields Section:** Integrated `PayloadFieldsEditor` featuring the Register Address column, Table/JSON view toggle, and field role assignment without hidden dropdowns.
4. **Footer:** Action buttons (Cancel, Save as New Preset, Save & Apply).

- [ ] **Step 1: Remove `<details><summary>` accordions from `PresetEditor`**
- [ ] **Step 2: Standardize all inputs into ADR-0009 `<Field>` and `<FieldLabel>` components with `px-1.5` container padding**
- [ ] **Step 3: Wire `registerAddress` persistence when saving presets to `/v1/settings/payload-presets`**
- [ ] **Step 4: Run `pnpm --filter web test` to verify all preset editing tests pass**
- [ ] **Step 5: Test on local dev browser (`http://localhost:3000/gateways`)**
