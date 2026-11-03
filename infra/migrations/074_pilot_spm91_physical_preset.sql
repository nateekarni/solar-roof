-- Immutable Pilot SPM91 R0-R12 candidate derived from the legacy decoder and
-- the supplied raw-register sample. It is intentionally not assigned to any
-- device: SPM91-01 must be selected, reviewed, published, and acknowledged via
-- the normal gateway configuration lifecycle before becoming active.
INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES
('00000000-0000-4000-8000-000000000074','pilot-spm91','1.1.0',
'{"id":"pilot-spm91","version":"1.1.0","sourceProfile":{"id":"pilot-spm91","version":"1.1.0"},"schemaVersion":"1.1","displayName":"Pilot SPM91 (R0-R12 candidate)","deviceType":"energy-meter","pollGroups":["realtime","energy"],"fields":[
{"tag":"energy.active.import.total","displayName":"พลังงานไฟฟ้ารวม (Total Active Energy)","pollGroup":"energy","sourceUnit":"kWh","targetUnit":"kWh","conversion":"identity","role":"billing-import","required":true,"registerAddress":"R0","registerCount":2,"dataType":"uint32","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.1,"offset":0},
{"tag":"electrical.voltage.l1_n","displayName":"แรงดันไฟฟ้า (Voltage)","pollGroup":"realtime","sourceUnit":"V","targetUnit":"V","conversion":"identity","registerAddress":"R2","registerCount":1,"dataType":"uint16","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.01,"offset":0},
{"tag":"electrical.current.l1","displayName":"กระแสไฟฟ้า (Current)","pollGroup":"realtime","sourceUnit":"A","targetUnit":"A","conversion":"identity","registerAddress":"R3","registerCount":2,"dataType":"uint32","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.001,"offset":0},
{"tag":"power.active.total","displayName":"กำลังไฟฟ้าจริง (Active Power)","pollGroup":"realtime","sourceUnit":"W","targetUnit":"W","conversion":"identity","role":"active-power","registerAddress":"R5","registerCount":2,"dataType":"int32","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.1,"offset":0},
{"tag":"power.apparent.total","displayName":"กำลังไฟฟ้าปรากฏ (Apparent Power)","pollGroup":"realtime","sourceUnit":"VA","targetUnit":"VA","conversion":"identity","registerAddress":"R7","registerCount":2,"dataType":"uint32","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.1,"offset":0},
{"tag":"power.reactive.total","displayName":"กำลังไฟฟ้ารีแอคทีฟ (Reactive Power)","pollGroup":"realtime","sourceUnit":"var","targetUnit":"var","conversion":"identity","registerAddress":"R9","registerCount":2,"dataType":"int32","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.1,"offset":0},
{"tag":"electrical.frequency","displayName":"ความถี่ (Frequency)","pollGroup":"realtime","sourceUnit":"Hz","targetUnit":"Hz","conversion":"identity","registerAddress":"R11","registerCount":1,"dataType":"uint16","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.01,"offset":0},
{"tag":"power.factor.total","displayName":"เพาเวอร์แฟกเตอร์ (Power Factor)","pollGroup":"realtime","sourceUnit":"1","targetUnit":"1","conversion":"identity","registerAddress":"R12","registerCount":1,"dataType":"int16","byteOrder":"big_endian","wordOrder":"little_word_first","scale":0.001,"offset":0}
]}'::jsonb);
