# Site modal advanced controls removal

User confirmed removing both advanced UI sections from add/edit site dialogs while preserving existing configuration on 2026-10-09.

- Main and additional device editors hide the JSON/device-type/poll-group advanced controls in these dialogs. Field tables and add/edit field dialogs remain available.
- Add site no longer renders the advanced reception section; its standard receive defaults and test-only preview remain intact.
- Edit site hides the advanced reception wrapper without changing or submitting a replacement receive configuration. Saved aliases and custom paths remain intact.
- Shared components retain advanced controls by default for other screens.
- Verification: web TypeScript and existing device field/draft/configuration loader regressions pass.
