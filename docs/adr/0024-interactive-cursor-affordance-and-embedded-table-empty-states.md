# ADR 0024: Interactive Cursor Affordances and Embedded Table Empty States

Status: Accepted, 2026-10-16.

## Context
1. **Interactive Cursor Affordances**:
   Tailwind CSS v4 preflight resets native `<button>` and control cursors to `cursor: default`. As a result, buttons, tabs, switches, select items, and table rows across the application did not show a hand pointer on hover. Users could not distinguish interactive elements from static labels, reducing clarity and usability. Additionally, disabled controls lacked consistent negative affordance (`cursor: not-allowed`).
2. **Table Empty States**:
   In the alert rules workspace (`/alerts`), empty states were rendered as a separate bordered card (`<Empty className="py-12 border rounded-xl bg-card">`) below the table container. When no rules were configured or search filters returned no matches, users saw an empty table frame followed by an external card below it, accompanied by a redundant pagination bar showing "แสดง 0 จากทั้งหมด 0 รายการ".

## Decision
1. **Universal & Component-Level Cursor Affordances**:
   - **Global `@layer base`**: Configured `apps/web/app/globals.css` so that interactive controls (`button:not(:disabled)`, `[role="button"]:not([aria-disabled="true"]):not([data-disabled])`, `[data-slot="button"]`, `[data-slot="dropdown-menu-item"]`, `[data-slot="select-trigger"]`, `[data-slot="select-item"]`, `[data-slot="tabs-trigger"]`, `[data-slot="checkbox"]`, `[data-slot="switch"]`) display `cursor: pointer`.
   - **Disabled Affordance**: Elements with `:disabled`, `button:disabled`, `[role="button"][aria-disabled="true"]`, or `[data-disabled]` display `cursor: not-allowed` (🚫).
   - **UI Primitives**: Explicitly updated `Button`, `SelectTrigger`, `SelectItem`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `TabsTrigger`, `Switch`, and `Checkbox` to include `cursor-pointer` and `disabled:cursor-not-allowed`.
   - **Clickable Table Rows**: Applied `cursor-pointer` to `TableRow` in `DataTable` whenever `onRowClick` is provided.

2. **In-Table Embedded Empty State Pattern**:
   - In `apps/web/features/alerts/alert-rules-table.tsx`, relocated the empty state into the table canvas via `DataTable`'s `emptyContent` prop:
     - **Initial Zero-State**: Renders `ShieldAlert` icon, title ("ยังไม่มีการตั้งค่ากฎแจ้งเตือน"), guidance description, and the `+ เพิ่มกฎแจ้งเตือน` button directly within the table row with `border-0 bg-transparent py-8`.
     - **Search Miss State**: Renders `Database` icon, title ("ไม่พบข้อมูล"), and descriptive search criteria message.
   - Removed the duplicate external card and separate search-miss box below the table entirely.
   - Mobile card view (`md:hidden`) mirrors the embedded borderless empty state when rows are empty.

3. **DataTable Pagination Suppression on Empty Data**:
   - In `apps/web/components/ui/data-table.tsx`, conditionally render the pagination bar only when `table.getFilteredRowModel().rows.length > 0`. When no rows exist, the pagination bar is suppressed to keep the canvas clean.

## Consequences
- Interactive affordances are consistent across all browsers and screen sizes without needing manual `cursor-pointer` utility classes on every individual button.
- Clean visual hierarchy in table views without redundant boxes or misleading zero-item pagination bars.
