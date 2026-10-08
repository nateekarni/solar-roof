# Document Layout Sarabun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute task-by-task with review gates.

**Goal:** Produce consistent A4 PDF contracts, invoices and receipts using TH Sarabun New and the approved Solar Roof logo.

**Architecture:** Render PDFs on the server from immutable document snapshots. Preview, print, download and email consume the same saved bytes. Use shared font/layout primitives while retaining distinct PPA, invoice and receipt bodies.

**Tech Stack:** TypeScript, NestJS, PostgreSQL, pdfmake, Next.js, authenticated blob preview.

**Spec:** ../../document-site-ui-grill-2026-10-08.md, accepted Q1–Q35.

## Global Constraints

- Branch codex/document-layout-sarabun starts from the verified combined prior work; reconcile dependencies without merging/deploying main.
- TH Sarabun New embedded in PDF; verify redistribution rights and bundle regular/bold/italic/bold-italic assets. Never silently substitute Tahoma.
- Black text/lines, light gray sections, approved colored document wordmark; Thai primary and secondary English headings.
- A4 portrait, repeated table headers, intact rows/signature groups, document number and page count.
- Preserve PPA content, selected TEST accounting policy, number patterns, exact decimals and historical PDF originals.
- New contracts create a saved PDF at creation; existing contracts create their first saved PDF at first document access. No new legal approval lifecycle.
- Save issuer/customer/signatory/rates/template version; editing company settings cannot change stored bytes.
- No invented fees, identity, signature, tax status or payment evidence. TEST marking remains on synthetic financial documents.

## Task 1: Shared font and page rendering

**Files:** create apps/api/src/modules/documents/document-layout.ts and document-layout.spec.ts; modify local-test-pdf.ts in the same directory; add verified font assets under apps/api/assets/fonts/th-sarabun-new/.

**Interface:** `documentDefinition(snapshot: DocumentSnapshot): object`; `DocumentSnapshot` includes type ('contract'|'invoice'|'receipt'), documentNumber, issuer, customer, signatories, rates/items, totals, approvedTransfers, logoDataUri, templateVersion and syntheticTest. Monetary values are decimal strings. Rendering consumes saved snapshot only.

- [ ] Add failing layout tests for A4, font family, gray/black palette, repeated table header, page footer and signature keep-together. Encode the first test as:
  ```ts
  const definition = documentDefinition(fixture);
  assert.equal(definition.pageSize, 'A4');
  assert.equal(definition.defaultStyle.font, 'THSarabunNew');
  assert.equal(definition.defaultStyle.color, '#000000');
  ```
- [ ] Run `pnpm --filter @solar/api test`; confirm the new assertions fail before adding the renderer.
- [ ] Implement shared page primitives with pdfmake: page margins, logo/header, paired identity sections, rate/item table, exact totals/amount words and footer. Contract body retains PPA text; receipt prints only approved transfers; optional missing data is omitted.
- [ ] Render fixtures with long Thai names/addresses, multi-rate rows, large exact totals and three-page content; inspect with pdftoppm and PDF text/font tools. Confirm font embedding, no clipping and no separated signature group.
- [ ] Run focused tests and commit this deliverable.

## Task 2: Contract originals and signatory snapshots

**Files:** modify apps/api/src/modules/billing/contract.service.ts, apps/api/src/modules/settings/settings.service.ts; create apps/api/src/modules/documents/contract-pdf.service.ts and contract-pdf.service.spec.ts; create next unused numbered migration for contract artifacts/snapshots and issuer signatory defaults; modify apps/web/features/contracts/contract-form-dialog.tsx and company settings form located through settings routes.

**Interface:** `ensureContractOriginal(contractId: string, actor: ScopedActor): Promise<{documentId:string; sha256:string}>`; scoped permission precedes any read/create. Store document artifact and complete snapshot transactionally; unique contract/template issuance key prevents duplicates. Signatory defaults fill editable contract fields and freeze on save.

- [ ] Add failing integration cases: creation produces one PDF; concurrent first access to an existing contract returns one original; unauthorized organization gets no artifact; a failed render rolls back creation; changing company defaults cannot change original hash.
  ```ts
  assert.equal(first.sha256, repeated.sha256);
  assert.equal(await countContractArtifacts(contractId), 1);
  await assert.rejects(() => ensureContractOriginal(contractId, otherOrganization));
  ```
- [ ] Implement snapshot/artifact creation using the existing immutable document-artifact storage pattern; add scoped contract PDF endpoint. Block missing required legal identity with localized field errors. Do not fabricate a PDF for incomplete legacy data.
- [ ] Add issuer name/title defaults and editable provider/customer signatory fields without signature-image workflow.
- [ ] Verify transaction rollback, uniqueness, access denial and original byte stability; commit.

## Task 3: One PDF across all channels

**Files:** modify apps/web/features/shared/document-preview-modal.tsx, original-document-preview.tsx and associated loader; modify apps/api/src/modules/billing/local-financial-application.service.ts and contract delivery path; test actual PDF download and Mailpit attachment.

**Interface:** the saved artifact metadata `{documentId,contentHash}` selects the authenticated original. Email delivery consumes the saved blob, never renders using current settings.

- [ ] Add failing preview/attachment tests for contracts as well as financial documents:
  ```ts
  assert.equal(sha256(downloadedBytes), savedHash);
  assert.equal(sha256(emailAttachmentBytes), savedHash);
  ```
- [ ] Route preview/print/download through the original PDF loader; remove HTML download for these document types. Preserve loading, integrity failure and access-error handling.
- [ ] On isolated TEST data, create a new contract/invoice/receipt and capture actual loopback email attachments. Verify all hashes, inspect three document types and multi-page fixtures at desktop/mobile TH/EN light/dark. Do not rewrite previously issued artifacts.
- [ ] Run API/UI tests and type checks, perform independent review, commit and publish a draft PR with actual evidence.
