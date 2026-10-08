# Site Preset Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute task-by-task with review gates.

**Goal:** Simplify site/device setup, centralize customer document identity and explicitly bind verified meter fields to billing.

**Architecture:** A searchable organization selector and edit modal manage shared customer defaults. Independent per-device editors create immutable local profile revisions. A dedicated billing-source binding connects device/field/purpose to provenance-verified cumulative readings; freshness remains separate from measurement validity.

**Tech Stack:** Next.js/React, existing shadcn controls, NestJS, PostgreSQL, canonical MQTT ingestion.

**Spec:** ../../document-site-ui-grill-2026-10-08.md and ../../billing-field-binding-review-2026-10-08.md.

## Global Constraints

- Branch codex/site-preset-form starts from verified combined work. Preserve scoped authorization and existing device history.
- Single upper Site ID, separate Gateway Name/Gateway ID, immutable protocol IDs after creation.
- Editable auto-filled model/name; no preset selected means manual configuration. Serial numbers are never invented.
- Organization tax defaults are shared; contract/document identities remain saved snapshots. Missing tax identity permits site setup but blocks document creation.
- Tables stay visible per device, preserve columns, bounded height/sticky headers and mobile horizontal scrolling. Advanced settings remain per-device collapsible.
- Remove exact requested help blocks. Keep actionable localized validation.
- Overrides never alter shared presets or historical samples. Preset switches with edits require overwrite confirmation.
- Billing uses an explicit binding and physical purpose, not an arbitrary checkbox or inferred tag meaning. Production financial gates remain intact.

## Task 1: Customer master selector and edit modal

**Files:** modify apps/api/src/modules/assets controller/service located through site routes; add next unused numbered migration for organization legalName/taxId/taxBranch/taxAddress/contactName/phone/documentEmail; modify apps/web/features/sites/site-form-dialog.tsx and site-edit-dialog.tsx; create organization-picker.tsx and organization-edit-dialog.tsx under features/organization; update contract auto-fill.

**Interface:** organization reference is `{id,name,code}`; organization defaults contain legal/tax/contact fields. New typed names create only on successful site save, with generated editable unique ORG code. Existing edits use a separate authorized modal and impact confirmation.

- [ ] Add failing cases for searching/selecting, unmatched new organization, duplicate code/concurrent creation, rollback without orphan organization, multiple sites in one organization and denied shared edits.
  ```ts
  assert.equal(secondSite.organizationId, firstSite.organizationId);
  assert.equal(await organizationCount(code), 1);
  assert.equal(await organizationCount(afterFailedSiteSaveCode), 0);
  ```
- [ ] Remove obsolete one-site-per-organization controller guard; preserve site/device identity uniqueness. Implement atomic site/new-organization save and scoped organization updates.
- [ ] Implement combobox rows with edit icons, modal fields and incomplete-document-data indication. Typing changes selection/new candidate; it does not rename the selected customer silently.
- [ ] Verify new contracts fill current defaults while existing snapshots remain unchanged; run focused API/UI tests and commit.

## Task 2: Independent preset/manual device editors

**Files:** modify features/sites/site-form-dialog.tsx, site-edit-dialog.tsx, site-form-values.ts and preset-picker.tsx; reuse features/shared/payload-fields-editor.tsx; add per-device editor component/tests; modify payload profile upgrade/create path in API to distinguish local override from shared preset.

**Interface:** each editor owns device identity, optional sourcePresetRevisionId, editable name/model/serial and field mapping. Saving override creates a new immutable device-local revision with source preset lineage; no shared catalogue entry is created.

- [ ] Add failing tests for two devices using the same preset retaining separate edits, no-preset manual setup, editable model, overwrite confirmation and preserved Site/Gateway/Device IDs.
  ```ts
  assert.notDeepEqual(deviceA.fields, deviceB.fields);
  assert.equal(deviceA.sourcePresetRevisionId, deviceB.sourcePresetRevisionId);
  assert.equal(sharedPresetHashAfterSave, sharedPresetHashBeforeSave);
  ```
- [ ] Move primary meter's two configuration inputs into Connection and Preset. Order extra devices preset/name/Device ID/model/serial/table. Remove the connection accordion and exact requested help text; render each table directly with sticky header and bounded scroll.
- [ ] Add/modify/delete fields through one validated editor; maintain original field-table columns plus actions and visible billing-binding marker. Advanced JSON/group mappings remain below the correct device.
- [ ] Preserve immutable identities, profile types and historical revisions; verify TH/EN errors and mobile table scroll; run focused tests and commit.

## Task 3: Explicit billing source and real ingestion provenance

**Files:** modify apps/api/src/modules/telemetry/payload-ingestion.ts and its spec, apps/api/src/modules/billing/local-financial-application.service.ts and its spec, active billing_meters binding persistence; create billing-source-binding service/tests and site billing-source UI; migration for source field/profile provenance and measurement-purpose metadata.

**Interface:** binding identifies siteId/deviceId/sourceTag/profileRevisionId/canonicalTag/sourceUnit/targetUnit/conversion/measurementPurpose. `targetUnit` is kWh and selected field must represent cumulative energy. Validity/quality are distinct from online freshness. Register and payload evidence use their actual provenance, never invented register IDs.

- [ ] Add a failing real-ingestion integration test: ingest actual MQTT payload messages containing mapped boundary counters, calculate a TEST cycle using those persisted readings, and verify reading IDs/profile revisions in meter_snapshot.
  ```ts
  assert.equal(cycle.consumed_kwh, '1234.567');
  assert.equal(Number(cycle.amount), 4623.45);
  assert.equal(cycle.meter_snapshot[0].opening.id, ingestedOpening.id);
  ```
- [ ] Add failures for another device/organization, unbound billing-role field, ambiguous field, wrong unit/conversion, invalid/future data, counter reset, missing boundary and changed profile identity. Add valid delayed-backfill case that stays offline yet remains eligible for its actual historical period.
- [ ] Implement explicit source binding and resolver for register or pinned canonical payload provenance. Bind selected main-meter field; retain exactly one valid selected cumulative field per main device. Do not auto-bind additional devices or infer physical purpose from import labels.
- [ ] Show device/field/path/units/conversion/purpose/latest kWh/formula and waiting verification status. Confirm billing-impact changes; changes affect new data only. Missing or invalid actual data blocks calculation, not site configuration save.
- [ ] Run actual MQTT → telemetry → TEST calculation → saved invoice/PDF/SMTP checks on an isolated fixture, including replay and cross-org denial. Keep production writes blocked; run API/UI tests and type checks, review, commit and publish a draft PR.
