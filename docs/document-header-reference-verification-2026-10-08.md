# Compact document header verification — 2026-10-08

Status: complete; scoped review, actual-flow verification and final independent review approved.

## Confirmed design

Logo15% / gap10% / issuer35% / gap10% / metadata30%; transparent approved-symbol stacked Solar Roof wordmark; title top-right with number/date only. Issuer logical name/address/tax/contact lines and full-width customer below. Exact TH Sarabun New, black/light-gray body, factual PPA and final-page signatures retained.

## Execution ruling

TEST_FINANCIAL_POLICY and hash retain legacy logo compatibility metadata to preserve accounting/readiness bindings. New actual PDF asset is frozen at issuance and identified by future template versions sarabun-a4-v4 and ppa-th-sarabun-new-v3. Platform and horizontal logo assets remain intact.

## Initial evidence

- Base4a26f9f, implementation4b05c5b.
- 39 focused tests, API typecheck and diff check pass per implementer report.
- Nine actual PDF fixtures /25 pages: ordinary three each1 page; long contract4/invoice4/receipt3/identity2/oversized-row4/header5. Geometry/fonts/text completeness inspected; every page retains Page n/total.
- Long-number footer regression found by visual review, reproduced red, fixed with measured reserve.
- Root independently viewed ordinary invoice PNG and verified layout matches accepted arrangement.
- New asset RGBA1254x1254, alpha0..255; transparent. Root generated using built-in imagegen from approved logo then refined wordmark width.
- Baseline16 saved-original hashes captured before runtime changes.

## Actual verification

Root-owned flow and review results will be appended after verification. Evidence directory: C:/Users/natee/.codex/visualizations/2026/10/08/01a1194a-084d-7ae1-9eec-a07cb4aac7e9/document-header-reference. Fixture assets are under fixtures, actual issued outputs use root of evidence directory.

## Root fresh actual verification

- Scoped reviewer approved spec and quality, no Critical/Important finding. Minor stale final-page PNG refreshed by root: rerasterized all9 PDFs and25 pages from final bytes.
- Integrated code4392065: full pnpm test/lint each8 successful tasks. API268 pass/0 fail/4 opt-in skips; web220 pass/0 fail/0 skips. Actual opt-in PostgreSQL contract-original/billing-boundary12/12, zero skips.
- Normal HTTP site8ce60758-ecbd-49b8-85c6-50e4e5aa1df7 with explicit billing binding and actual normal MQTT opening/closing counters. No SQL-created telemetry/contracts/billing records.
- Contract0c3e3151-2ed5-4877-aa7f-bcdc4323f70a, cycle6ab21359-966f-40b8-8450-2ce310c1d50b. InvoiceINV2026100009 and receiptRCT2026100006, simulated4,623.45THB under unchanged policy.
- Stored/download/actual SMTP Mailpit attachment bytes match for all3. Cross-organization404, retry no extra mail, arbitrary recipient rejection and customer send restrictions pass.
- Actual browser saved-original iframe/download/print share blob; downloaded PDF hash matches stored contract; no desktop/mobile overflow or page errors.
- Actual PDFs3/3 single A4 page and embedded TH Sarabun New. Root visually inspected all3 new header PDFs and long continuation final-page sample.
- All16 baseline originals preserve exact hashes; current19 after3 new originals. No reseed/reset/historical rerender.
- Contract hash0bd860ae1cd2d74bd8f71c7ac040ba968b55eef344f4d821e51d26b92220af27.
- Invoice hash5fd49050aac8d88f9207af3a307a64c666a6da10db481898591d56383d72c509.
- Receipt hash20d3fa23956591086baa0552b9a044da053499fcf451ef9f86c386b4991bc464.

Final independent Astra review approved4a26f9f..4b05c5b with no actionable findings. Draft PR https://github.com/nateekarni/solar-roof/pull/6. No main merge/deployment.
