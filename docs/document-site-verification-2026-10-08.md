# Document and site implementation verification — 2026-10-08

Status: implementation, independent reviews and final integration verification passed. No main merge or deployment.

## Verified by the controller

- Real loopback MQTT on port 11889 passed through normal `MqttIngestionService`, PostgreSQL telemetry and TEST billing calculation. Opening/closing accepted payload reading IDs are `26029465-1014-4bca-ad43-fc4e55e9930e` and `2f4b8b22-10ad-4182-8b85-9cf242ee8c98`.
- Cycle `c29f5bab-73a5-445d-bf2e-5b9a8206ce8e` retains payload profile `be77d950-5842-4771-9cb3-12c5e98e93aa` and immutable source binding `f418731d-bbd2-4e00-accd-007b0d7f6c98`, without fabricated register mapping IDs. Actual difference is 1,234.567 kWh; the accepted local TEST policy yields 4,623.45 THB.
- Network runner covers replay/idempotency, conflicting retries, wrong scope/field/unit, invalid/future/missing data, intermediate counter reset, prospective source changes and required rebind after profile activation. Valid historical backfill remains offline while qualifying for its actual billing period.
- Independent read-only queries checked the saved cycle and both reading IDs, and verified stored and computed byte hashes for all seven pre-existing PDF originals. All seven are unchanged.
- Contract-original PostgreSQL integration suite passed 7/7, using a generated isolated schema. Cases cover actual POST/render/scoped download, immutable originals after company changes, five concurrent first accesses producing one artifact, cross-organization denial, complete rollback on render failure and refusal to fabricate incomplete legacy identity. The test removed only its generated schema.
- Shared renderer and calendar correction passed scoped review. Controller inspected actual contract/invoice PNGs: black/gray A4 layout and Thai glyphs remain inside the page bounds. Renderer worker supplied exact-font embedding, pagination and three-page stress evidence.

## Review corrections

- Boundary selection aggregates every equally nearest reading before selecting one. The initial `LIMIT 2` could hide a third conflicting reading; real PostgreSQL SELECT-only regression proves contradictory counters reject while numerically equal duplicates pass.
- Contract identity autofill tracks explicitly edited and cleared fields. Delayed defaults cannot overwrite them; locale changes preserve overrides; canceled requests do not write state. Scoped re-review approved the correction.
- New Thai-primary PDF display uses Buddhist-calendar dates while ISO snapshot dates, Gregorian document numbering and already issued bytes remain unchanged.

## Final verification

- Integration code head: `3effd7ef8884fd58d5ed313cc9fda26d2aafe6bd`. Whole-branch review independently approved this immutable head; all task reviews and corrective re-reviews also approved.
- Complete `pnpm test`: eight workspace tasks succeeded. API 255 passed, with four explicit environment opt-ins skipped in the default run; web 220 passed. Complete `pnpm lint`: all eight workspace typecheck tasks succeeded.
- Re-ran the two relevant PostgreSQL opt-ins against the authorized local database: contract-original isolation/concurrency and read-only boundary aggregation, 12 tests passed with zero skips. The dashboard and bundle-ingestion opt-ins require their separately named external fixtures; actual MQTT transport and full document channels were exercised independently below.
- Fresh final flow: site `d15a30ea-dc46-4a5d-b08e-32d8d735eef4`, contract `c11ae35f-e244-42db-b9af-784c22b84a07`, cycle `f9c9a87e-6412-4880-ae81-a2eae20e8ac6`. Contract, invoice INV2026100007 and receipt RCT2026100004 are each one A4 page; the financial PDFs have `sarabun-a4-v2` subjects. Actual SMTP attachments exactly match saved and downloaded bytes. Cross-organization downloads are denied and send retries create no duplicate email.
- Browser creation saved exactly one new site (`aad6dbc5-8552-4a2c-b213-47ff0a4ff42f`), opened the existing edit dialog using that saved ID, and required explicit cumulative field and physical purpose before binding. The resulting status correctly waits for actual readings. Organization edit exposes shared name/code/legal/tax/address/contact/email fields together.
- Real browser field CRUD, independent extra devices, dirty-preset cancellation, original PDF preview/download/print source parity and creation/binding passed at 1440px and 390px. English/dark and Thai/light billing views passed with no page overflow or JavaScript page errors. Removed Topic helper text is absent. The test account preferences were restored.
- All seven baseline original PDF hashes remain unchanged after the final new document flow.
- Published drafts: [PDF documents #6](https://github.com/nateekarni/solar-roof/pull/6) and [site/organization/billing source #7](https://github.com/nateekarni/solar-roof/pull/7), both against the verified `codex/ui-financial-integration` base. No main merge or deployment.

Production financial policy and write gates remain unchanged. Synthetic recipients are delivered only to the local email capture service.

## Additional actual acceptance

- A fresh site was created through the normal Admin HTTP endpoint and explicitly bound to a manually configured device profile. Real MQTT opening/closing counters then passed through the normal receiver; no telemetry readings were inserted by SQL.
- Contract `8a9c0caf-317c-44e4-8dac-bd686c2d8a23` and cycle `1aed2d30-131c-40e9-9877-bebf3a63736c` completed new contract → calculate → invoice → full TEST settlement → approved combined receipt. All three downloads exactly match their actual Mailpit PDF attachments and stored SHA-256 hashes. Cross-organization downloads returned 404; retries sent no extra mail; arbitrary recipients and customer-triggered contract sending were denied.
- Actual financial PDF inspection exposed signatures alone on page two. Future financial template `sarabun-a4-v2` now fits these exact saved invoice/receipt snapshots into one A4 page. Independent review confirmed all 45 stress rows across five pages, repeated headers, embedded Sarabun faces and intact signatures. Previously issued original bytes remain frozen.
- Real browser login and Preset field interactions passed with installed Edge through Playwright: autofill, field edit modal, independent additional-device profile, delete/add fields, dirty Preset cancellation and desktop/mobile page overflow checks. Browser plugin not available; no browser installation was needed.
- Site organization reassignment now rejects any historical contract, billing cycle or document. Same-organization edits and history-free reassignment remain supported; denied new organizations roll back atomically. Separate scoped review approved the guard.

## Execution rulings

1. Adapt bash bookkeeping to PowerShell on Windows. If wrong, regenerate the ledger; business behavior is unaffected.
2. Reserve additive migrations 033–036 for organization identity, local device profiles, bindings and contract originals. Applied migration bytes are immutable; changing the allocation later requires a new migration.
3. Target the two new draft PRs at the previously verified `codex/ui-financial-integration` branch. If the review stack changes, retarget/replay the PRs; do not merge main implicitly.
4. Display new Thai-primary PDFs with Buddhist-calendar dates while preserving ISO snapshots and Gregorian numbering. A correction affects future presentation only.
5. Carry the identical organization-identity prerequisite on both feature branches so document creation does not depend on unfinished site UI. It can later be extracted to a shared prerequisite branch.
6. After creating a site, open its existing edit dialog at explicit billing setup with actual saved IDs. Leaving keeps a configured but unbound site; billing calculation stays blocked. A later atomic creation/binding design must preserve historical evidence.
7. When all agent slots were occupied, reuse an available agent for a corrective task and assign a separate reviewer. The cost is reduced context isolation; scoped review remains mandatory.
8. Block historical organization reassignment rather than silently transfer document authorization. A future transfer feature needs explicit historical access and ownership rules.
9. Compact only future financial PDF templates and bump their version; preserve contract layout and all issued originals. If spacing proves insufficient, change a future template while keeping saved PDFs intact.


