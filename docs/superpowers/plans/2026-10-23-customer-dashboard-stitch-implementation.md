# Customer Dashboard Stitch Implementation

## Goal
Restyle the customer dashboard using the two user-selected Stitch screens (tablet node `b5ced2abc65246deb612eaa5194bff55` and mobile node `4e08f8cd8e0a4c56a3be7110680d65fb`) while preserving the app's theme, language, typography, shared components, access control, and actual data semantics.

## Design and scope
- Keep the existing customer shell and settings for light/dark theme and Thai/English language. Use the existing font stack and CSS tokens rather than the sample Stitch brand, colors, or fonts literally.
- Show the focused bill first only when one exists. Preserve payment actions and financial details. Do not show a no-bill card.
- Put the date picker in the Dashboard heading's upper right and retain the six-month production-history limit. Keep the production section directly on the page without an outer wrapper.
- Adapt the selected Stitch layout for desktop, tablet, and mobile: visual energy flow followed by daily energy, hourly chart, 7/30-day trend, readable hourly rows, and recent documents.
- Build a reusable Solar / Load / Grid three-circle flow view. Solar and Grid should visibly flow toward Load in the center only when verified instantaneous measurements and direction are available. Null or stale measurements display a dash and do not animate. Never convert kWh to kW or infer power from generic billing-meter telemetry.
- Reuse shared shadcn components such as Button, Card, Tabs, Badge, DatePicker, Chart, and Table where appropriate. Maintain keyboard, reduced-motion, responsive, and accessibility support.
- If the customer API lacks verified power topology, extend the customer-scoped API using the existing verified dashboard power-flow rules and authorization. Otherwise render the safe unavailable state until it is supported.
- Use existing customer portal routes; do not alter staff/admin dashboards.

## Verification
- Focused component tests for bill conditional rendering, date picker, flow availability/direction, theme and locale rendering, and customer scope.
- Typecheck and relevant browser tests.
- Open local customer dashboard at desktop and mobile widths, inspect chart, flow, billing, and empty states.
