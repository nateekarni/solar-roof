# Configurable Gateway Payload Reception Implementation Plan

**Goal:** Receive single telemetry envelopes and the supplied gateway bundle, with explicit identity aliases and per-message durable acknowledgments.

**Architecture:** A bounded decoder extracts envelopes using versioned gateway settings. The existing ingestion transaction continues to validate registered devices, normalize units, deduplicate and commit each envelope. MQTT publishes each acknowledgment only after its corresponding commit.

**Tech Stack:** TypeScript, Zod, NestJS, PostgreSQL, MQTT, React and shadcn.

**Spec:** User-approved design in this conversation, 2026-10-06.

## Constraints
- Preserve existing single-envelope callers and other uncommitted work.
- Route bundles only within the receiving broker and gateway.
- Never treat bundled dataAcept as telemetry; never acknowledge rejected messages as accepted.
- Explicit source aliases must match before changing identifiers or profile references.
- Preserve source timestamps and raw values; historical data must not appear live.

## Task 1: Decoder and immutable reception settings
- [x] Add decoder tests for supplied bundle, custom paths, aliases, unsupported entries and oversized batches.
- [x] Run tests before implementation and observe missing-feature failures.
- [x] Implement payload-receive.ts with maximum 32 messages, safe dot paths and strict configuration validation.
- [x] Create gateway_payload_receive_revisions migration with version and JSON configuration.

## Task 2: Ingestion and MQTT acknowledgments
- [x] Add MQTT bundle tests for multiple device bindings, partial rejection, broker isolation and commit-before-ACK.
- [x] Add acceptMany while retaining accept for each transaction; load gateway settings using outer topic and broker.
- [x] Route child topics from normalized identities only inside the registered gateway; publish each ACK immediately after commit.
- [x] Run existing ingestion, replay, MQTT and multi-broker regression tests.

## Task 3: Settings, preview and UI
- [x] Add site reception revision save and read-only preview endpoints with per-device validation.
- [x] Add editor and JSON preview in the existing reception tab; show revision, settings, accepted/rejected preview and save feedback.
- [x] Keep settings immutable and bound concurrent saves to the revision the user loaded.
- [x] Generate complete per-poll-group fixtures for all configured fields.
- [x] Run API and web TypeScript checks and focused endpoint tests.

## Task 4: Verification and user instructions
- [x] Apply migration locally using the existing migration runner.
- [x] Verify supplied bundle through the actual local database and MQTT receiver without changing existing site settings.
- [x] Write setup instructions for source/device/profile aliases, SmartLogger registration, fresh telemetry and dataAcept subscriptions.
