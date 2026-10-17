# ADR 0034: Theme-Aware Popover Tooltips and Site Scope Visual Affordance

## Status
Accepted

## Context
1. **Low Contrast & Dark-on-Dark Tooltip Content**:
   - The default `TooltipContent` implementation in `apps/web/components/ui/tooltip.tsx` hardcoded `bg-foreground text-background` (black surface in light mode).
   - In `StaffPermissionsWorkspace`, the assigned sites tooltip rendered child elements containing `text-foreground` and `text-muted-foreground`, resulting in dark gray text on a pitch-black surface that was virtually unreadable in light mode.
2. **Generic Bulleted Dump vs. Cohesive System Theme**:
   - The site scope tooltip previously dumped site names in an unstyled bulleted list with no visual hierarchy, no brand accents, and no handling for employees assigned to numerous sites (which risked overflowing the viewport).
3. **Weak Trigger Affordance on `+n` Badge**:
   - The `+n` badge in the table used `variant="secondary"` (muted gray), blending passively into table rows and failing to convey that it was an interactive trigger that could be hovered over to view the full list of assigned sites.

## Decision
1. **Theme-Aware `variant="popover" | "rich"` in `TooltipContent`**:
   - Extended `TooltipContent` in `apps/web/components/ui/tooltip.tsx` with a `variant` prop (`default`, `popover`, `rich`).
   - When set to `popover` or `rich`, the tooltip adapts to the system's theme tokens:
     - `bg-popover text-popover-foreground border border-border shadow-lg rounded-xl`
     - Light mode: crisp white background with dark ink text.
     - Dark mode: dark card background with light text.
     - Arrow: themed with `bg-popover fill-popover border-b border-r border-border`.
     - Supports `inline?: boolean` to enable direct static SSR and component unit testing.
2. **Structured Popover Layout for Site Scope**:
   - Extracted and modularized `EmployeeScopeBadgeList` in `staff-permissions-workspace.tsx`.
   - **Header**: Features a `Building2` icon in brand primary color (`text-primary`), title ("ขอบเขตไซต์งาน" / "Assigned Sites"), and a pill badge displaying the total count (`[5 ไซต์]`).
   - **Divider**: Thin subtle separator (`border-b border-border/80`).
   - **List Items**: Each site item is cleanly spaced with a primary brand bullet dot (`bg-primary size-1.5 rounded-full`) and truncated name.
   - **Scrollable Constrained View**: Applied `max-h-48 overflow-y-auto pr-1` to prevent overflow when employees have many assigned sites.
3. **Primary Accent Interactive Badge**:
   - Styled the `+n` trigger badge with `bg-primary/10 text-primary border-primary/25 hover:bg-primary/20 transition-colors rounded-full font-medium cursor-pointer`, making it immediately recognizable as an interactive affordance.

## Consequences
- Site scope tooltips and future rich tooltips integrate seamlessly into the Solar Roof design system in both Light and Dark modes.
- Contrast issues are completely eliminated.
- All web unit tests pass without regression.
