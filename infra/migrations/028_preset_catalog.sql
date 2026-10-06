-- Catalogue lifecycle is separate from immutable ingestion evidence.
CREATE TABLE payload_preset_archives(profile_id text PRIMARY KEY,archived_at timestamptz NOT NULL DEFAULT now());
INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES
('00000000-0000-4000-8000-000000000003','pilot-spm91','1.0.0',
'{"id":"pilot-spm91","version":"1.0.0","sourceProfile":{"id":"pilot-spm91","version":"1.0.0"},"schemaVersion":"1.1","displayName":"Pilot SPM91","deviceType":"energy-meter","pollGroups":["realtime","energy"],"fields":[
{"tag":"electrical.voltage.l1_n","displayName":"แรงดัน L1","pollGroup":"realtime","sourceUnit":"V","targetUnit":"V","conversion":"identity"},
{"tag":"electrical.current.l1","displayName":"กระแส L1","pollGroup":"realtime","sourceUnit":"A","targetUnit":"A","conversion":"identity"},
{"tag":"electrical.frequency","displayName":"ความถี่","pollGroup":"realtime","sourceUnit":"Hz","targetUnit":"Hz","conversion":"identity"},
{"tag":"power.active.total","displayName":"กำลังไฟฟ้าจริง","pollGroup":"realtime","sourceUnit":"W","targetUnit":"W","conversion":"identity","role":"active-power"},
{"tag":"power.reactive.total","displayName":"กำลังไฟฟ้ารีแอกทีฟ","pollGroup":"realtime","sourceUnit":"var","targetUnit":"var","conversion":"identity"},
{"tag":"power.apparent.total","displayName":"กำลังไฟฟ้าปรากฏ","pollGroup":"realtime","sourceUnit":"VA","targetUnit":"VA","conversion":"identity"},
{"tag":"power.factor.total","displayName":"Power factor","pollGroup":"realtime","sourceUnit":"1","targetUnit":"1","conversion":"identity"},
{"tag":"energy.active.import.total","displayName":"พลังงานนำเข้าสะสม","pollGroup":"energy","sourceUnit":"Wh","targetUnit":"kWh","conversion":"wh-to-kwh","role":"billing-import","required":true},
{"tag":"energy.active.export.total","displayName":"พลังงานส่งออกสะสม","pollGroup":"energy","sourceUnit":"Wh","targetUnit":"kWh","conversion":"wh-to-kwh"}
]}');
