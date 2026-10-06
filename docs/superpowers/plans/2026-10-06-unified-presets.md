# Unified Preset implementation

**Goal:** Preset selector จุดเดียว มี Edit/Delete/Create และ manual JSON mapping โดยรักษาหลักฐานเดิม

**Approved design:** ผู้ใช้อนุมัติ implementation หลังตรวจ payload Pilot SPM91 วันที่ 6 ตุลาคม 2026. JSON แปลค่ามาจาก Gateway แล้ว ไม่ใช้ Register decoder ซ้ำ; legacy Register adapter ยังคงรองรับ

**Architecture:** External interface เป็นการเลือก Preset ต่ออุปกรณ์ ภายในเลือก JSON/register adapter. JSON config revision immutable; source profile ID/version แยกจาก local mapping version. Archive catalogue แยกจาก immutable evidence

- [x] Tests แยก source/local version, literal source aliases, required groups, duplicate source rejection
- [x] Normalizer รองรับ sourceTag, required และ explicit general-data role; old configs backward compatible
- [x] Migration 028 catalogue archive + Pilot SPM91; migration checksum ยอมรับ LF/CRLF เท่านั้น
- [x] Preset option มี Edit/Delete และ manual create; legacy choices ใช้ selector เดียวและเลือกวิธีรับให้เอง
- [x] Editor: manual fields, source ID/version, pollGroup, unit conversion, aliases, required/optional, role, copy-as-new, JSON inference และ read-only preview
- [x] Site create/edit/additional devices/settings ใช้ Preset picker; fixture/import/manual alias ใช้ source metadata
- [x] Delete retains history/current devices; prevents new binding; archived binding can upgrade away
- [x] Independent review พบ catalog-type replacement/archived filter defects และแก้พร้อม regression test
- [x] Actual local browser test passed manual/inferred CRUD, preview 1700 Wh → 1.7 kWh, version/source pinning, archive retaining two revisions, 390/1440px และ site auto-mode selection
- [x] Final verification: lint, full test suite and browser checks passed

**Deferred:** Storage audit remediation remains in [pilot follow-up](2026-10-06-pilot-followup.md), not part of this Preset change. Gateway remote configuration/verified Register recipe publishing is separate from JSON mapping and is not activated by selecting a Preset

**Operation guide:** [Unified Presets](../../runbooks/unified-presets-th.md)
