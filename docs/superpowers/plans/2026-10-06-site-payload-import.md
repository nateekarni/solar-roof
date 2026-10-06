# Site payload-assisted configuration

Approved scope: infer devices and reception settings from sample JSON, retain explicit serial and billing selection, share add/edit experience, reusable browser-local templates, section icons, and table-only edge-to-edge details.

- [x] Add tested pure sample parser: deduplicate poll groups, reject conflicting IDs/profiles, exact version matching, reconcile topic scope without changing locked IDs.
- [x] Add shared import preview: JSON/topic fields, editable device serial/profile, explicit billing selection, review before apply, advanced aliases collapsed.
- [x] Wire creation and existing-site reception editing; preserve existing devices, profile versions and billing assignment.
- [x] Add browser-local configuration templates excluding measurements and serial numbers.
- [x] Standardize section headers and correct details padding outside tables.
- [x] Verify TypeScript, parser tests and rendered add/edit/details UI without changing saved user sites.
