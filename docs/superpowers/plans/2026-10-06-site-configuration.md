# Site configuration implementation plan

**Goal:** Create and configure a site once; expose saved configuration and received data in details without nested cards.
**Architecture:** Reuse a controlled reception editor between creation and editing. Provision devices and reception settings in the existing creation transaction. Read history through a scoped, paginated query.
**Approved design:** User approval in this conversation, including flat Gateway & primary meter sections.
**Constraints:** Preserve unrelated work; theme tokens; never expose broker passwords; standard payload and register flows remain supported.

- [x] Flatten edit modal sections and normalize action menu colors.
- [x] Extract reusable reception fields and include additional devices/settings during creation.
- [x] Validate all planned device bindings and save reception settings atomically.
- [x] Show saved broker/device/reception configuration in site details.
- [x] Add scoped received data history with search, dates, and pagination.
- [x] Run provisioning/history tests, both type checks, and inspect rendered UI.

Verification: 21 tests passed, including isolated local MQTT/PostgreSQL reception, scoped history search, atomic creation and rollback. API and web type checks passed. Browser checked flat edit sections, menu colors and draft persistence across wizard steps. Local authenticated configuration/history and draft preview endpoints returned success; preview persisted no telemetry.
