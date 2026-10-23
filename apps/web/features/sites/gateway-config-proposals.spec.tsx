import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {GatewayConfigProposal,GatewayConfigPayload,GatewayDeviceConfig} from '@solar/api-contracts';
import {LocaleProvider} from '../../providers/locale-provider';
import {
  GatewayConfigProposalsView,
  gatewayProposalApprovalRequest,
  gatewayProposalCanApprove,
  gatewayProposalDiffRows,
  gatewayProposalErrorMessage,
  validateGatewayProposalRejection,
} from './gateway-config-proposals';

const activeDevice:GatewayDeviceConfig={deviceId:'M1',enabled:true,mappingSource:'manual',deviceType:'energy-meter',model:'PM2230',serialNumber:'A1',protocol:'modbus-tcp',connection:{host:'192.0.2.10',port:502,slaveId:1},pollGroups:['energy'],mappings:[{tag:'energy.import',displayName:'Import',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import',registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',wordOrder:'big_word_first',scale:1,offset:2}]};
const proposalSnapshot=(status:GatewayConfigProposal['status'],base=4):GatewayConfigProposal=>({
  id:`11111111-1111-4111-8111-11111111111${status.length%10}`,gatewayId:'22222222-2222-4222-8222-222222222222',proposalId:`proposal-${status}`,baseConfigVersion:base,activeConfigVersion:4,status,approvalMode:'manual',receivedAt:'2026-10-19T01:00:00Z',
  activeSnapshot:{schemaVersion:'1.1',messageType:'config',messageId:'active',gatewayId:'GW-1',siteId:'SITE-1',configVersion:4,configHash:'a'.repeat(64),issuedAt:'2026-10-19T00:00:00Z',approvedBy:'admin',devices:[activeDevice]} satisfies GatewayConfigPayload,
  snapshot:{schemaVersion:'1.1',messageType:'configUpdate',messageId:'update',gatewayId:'GW-1',siteId:'SITE-1',proposalId:`proposal-${status}`,baseConfigVersion:base,sentAt:'2026-10-19T01:00:00Z',devices:[{...activeDevice,mappings:[{...activeDevice.mappings[0]!,registerAddress:'3206',scale:0.01}]},{...activeDevice,deviceId:'INV-2',model:'SUN2000',serialNumber:'B2'}]},
});

test('proposal review shows all states, base versus active version and complete device/register changes',()=>{
  const proposals=[proposalSnapshot('pending'),proposalSnapshot('stale',3),proposalSnapshot('approved'),proposalSnapshot('rejected')];
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><GatewayConfigProposalsView proposals={proposals} canManage onApprove={()=>{}} onReject={()=>{}}/></LocaleProvider>);
  for(const label of ['Pending review','Stale','Approved','Rejected','Base version 4','Active version 4','M1','INV-2','energy.import','3206','0.01','modbus-tcp','192.0.2.10','Wh → kWh','offset 2','billing-import'])assert.match(html,new RegExp(label));
  assert.match(html,/Approve/);
  assert.match(html,/Reject/);
  assert.match(html,/disabled=""[^>]*>Approve|>Approve<\/button>/);
});

test('proposal review follows the current Thai locale',()=>{
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="th"><GatewayConfigProposalsView proposals={[proposalSnapshot('pending')]} canManage onApprove={()=>{}} onReject={()=>{}}/></LocaleProvider>);
  for(const label of ['รอตรวจสอบ','เวอร์ชันฐาน 4','เวอร์ชันที่ใช้งาน 4','อนุมัติ','ปฏิเสธ'])assert.match(html,new RegExp(label));
});

test('proposal review hides the whole section when the gateway has not sent an update',()=>{
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="th"><GatewayConfigProposalsView proposals={[]} canManage onApprove={()=>{}} onReject={()=>{}}/></LocaleProvider>);
  assert.equal(html,'');
});

test('proposal review card uses comfortable vertical padding when an update exists',()=>{
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="th"><GatewayConfigProposalsView proposals={[proposalSnapshot('pending')]} canManage onApprove={()=>{}} onReject={()=>{}}/></LocaleProvider>);
  assert.match(html,/ข้อเสนอการตั้งค่าจากเกตเวย์/);
  assert.match(html,/py-5/);
});

test('proposal diff identifies device and register changes against the active immutable snapshot',()=>{
  const rows=gatewayProposalDiffRows(proposalSnapshot('pending'));
  assert.deepEqual(rows.map(row=>[row.deviceId,row.tag,row.change]),[
    ['M1','energy.import','changed'],
    ['INV-2','energy.import','added'],
  ]);
  assert.equal(rows[0]!.beforeAddress,'3204');
  assert.equal(rows[0]!.afterAddress,'3206');
  assert.match(rows[0]!.beforeDeviceConfiguration,/enabled · manual · modbus-tcp · host 192\.0\.2\.10 · port 502 · slaveId 1 · polls energy/);
  assert.match(rows[0]!.afterDeviceConfiguration,/enabled · manual · modbus-tcp · host 192\.0\.2\.10 · port 502 · slaveId 1 · polls energy/);
  assert.match(rows[0]!.decoder,/uint32 · ×2 · scale 0\.01 · offset 2 · Wh → kWh · wh-to-kwh · big_endian · big_word_first · energy · billing-import/);
});

test('proposal diff exposes explicit before and after device configuration and decoder values',()=>{
  const proposal=proposalSnapshot('pending');
  proposal.snapshot.devices[0]={...activeDevice,model:'PM2230-v2',serialNumber:'A2',connection:{host:'192.0.2.20',port:1502,slaveId:2},pollGroups:['energy','realtime'],mappings:[{...activeDevice.mappings[0]!,scale:0.01}]};
  const row=gatewayProposalDiffRows(proposal)[0]!;
  assert.match(row.beforeDeviceConfiguration,/host 192\.0\.2\.10.*port 502.*slaveId 1.*polls energy/);
  assert.match(row.afterDeviceConfiguration,/host 192\.0\.2\.20.*port 1502.*slaveId 2.*polls energy, realtime/);
  assert.match(row.beforeDeviceConfiguration,/model PM2230.*serial A1/);
  assert.match(row.afterDeviceConfiguration,/model PM2230-v2.*serial A2/);
  assert.match(row.beforeDecoder,/scale 1/);
  assert.match(row.afterDecoder,/scale 0\.01/);
  assert.equal(row.change,'changed');
  const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><GatewayConfigProposalsView proposals={[proposal]} canManage onApprove={()=>{}} onReject={()=>{}}/></LocaleProvider>);
  for(const label of ['Device before','Device after','Decoder before','Decoder after','192.0.2.10','192.0.2.20','scale 1','scale 0.01'])assert.match(html,new RegExp(label));
});

test('proposal diff makes source tag and required-only changes explicit on both sides',()=>{
  const proposal=proposalSnapshot('pending');
  const requiredMapping={...activeDevice.mappings[0]!,tag:'power.active',sourceTag:'meter.power.raw',required:true};
  proposal.activeSnapshot!.devices[0]!.mappings=[{...activeDevice.mappings[0]!,sourceTag:'meter.import.raw',required:false},requiredMapping];
  proposal.snapshot.devices[0]!.mappings=[{...activeDevice.mappings[0]!,sourceTag:'meter.import.total',required:false},{...requiredMapping,required:false}];
  const [sourceTagRow,requiredRow]=gatewayProposalDiffRows(proposal);
  assert.match(sourceTagRow!.beforeDecoder,/source tag meter\.import\.raw.*required no/);
  assert.match(sourceTagRow!.afterDecoder,/source tag meter\.import\.total.*required no/);
  assert.match(requiredRow!.beforeDecoder,/source tag meter\.power\.raw.*required yes/);
  assert.match(requiredRow!.afterDecoder,/source tag meter\.power\.raw.*required no/);
  assert.equal(sourceTagRow!.change,'changed');
  assert.equal(requiredRow!.change,'changed');
});

test('Thai proposal detail formatter localizes every human-facing label',()=>{
  const proposal=proposalSnapshot('pending');
  proposal.activeSnapshot!.devices[0]!.mappings[0]={...activeDevice.mappings[0]!,sourceTag:'meter.import.raw',required:false};
  proposal.snapshot.devices[0]!.mappings[0]={...activeDevice.mappings[0]!,sourceTag:'meter.import.total',required:true};
  const row=gatewayProposalDiffRows(proposal,'th')[0]!;
  for(const detail of [row.beforeDeviceConfiguration,row.afterDeviceConfiguration,row.beforeDecoder,row.afterDecoder])assert.match(detail,/[ก-๙]/);
  for(const label of ['เปิดใช้งาน','กำหนดเอง','โปรโตคอล','โฮสต์','พอร์ต','รหัสอุปกรณ์รอง','กลุ่มการอ่าน','ประเภท','รุ่น','หมายเลขเครื่อง','ชนิดข้อมูล','จำนวนรีจิสเตอร์','ตัวคูณ','ค่าชดเชย','แท็กต้นทาง','จำเป็น ไม่','จำเป็น ใช่']){
    assert.match(`${row.beforeDeviceConfiguration} ${row.afterDeviceConfiguration} ${row.beforeDecoder} ${row.afterDecoder}`,new RegExp(label));
  }
  assert.doesNotMatch(`${row.beforeDeviceConfiguration} ${row.afterDeviceConfiguration} ${row.beforeDecoder} ${row.afterDecoder}`,/\b(?:enabled|disabled|manual|protocol|host|port|slaveId|polls|type|manufacturer|model|firmware|serial|profile|preset|scale|offset|source tag|required|yes|no)\b/i);
});

test('zero-mapping proposal rows derive change from device presence and complete device configuration',()=>{
  const before:GatewayDeviceConfig={deviceId:'LOGGER-1',enabled:false,mappingSource:'manual',model:'Logger A',protocol:'modbus-tcp',connection:{host:'192.0.2.30',port:502},pollGroups:['daily'],mappings:[]};
  const after:GatewayDeviceConfig={...before,model:'Logger B',connection:{host:'192.0.2.31',port:1502},pollGroups:['daily','realtime']};
  const cases:[string,GatewayDeviceConfig[],GatewayDeviceConfig[],string][]=[
    ['unchanged',[before],[structuredClone(before)],'unchanged'],
    ['changed',[before],[after],'changed'],
    ['added',[],[before],'added'],
    ['removed',[before],[],'removed'],
  ];
  for(const [label,activeDevices,nextDevices,expected] of cases){
    const proposal=proposalSnapshot('pending');
    proposal.activeSnapshot!.devices=activeDevices;
    proposal.snapshot.devices=nextDevices;
    const rows=gatewayProposalDiffRows(proposal);
    assert.equal(rows.length,1,label);
    assert.equal(rows[0]!.tag,'—',label);
    assert.equal(rows[0]!.change,expected,label);
  }
  const changed=gatewayProposalDiffRows((()=>{const proposal=proposalSnapshot('pending');proposal.activeSnapshot!.devices=[before];proposal.snapshot.devices=[after];return proposal;})())[0]!;
  assert.match(changed.beforeDeviceConfiguration,/model Logger A.*host 192\.0\.2\.30.*port 502|host 192\.0\.2\.30.*port 502.*polls daily.*model Logger A/);
  assert.match(changed.afterDeviceConfiguration,/host 192\.0\.2\.31.*port 1502.*polls daily, realtime.*model Logger B/);
});

test('approval is optimistic and stale proposals cannot be approved',()=>{
  const pending=proposalSnapshot('pending');
  assert.equal(gatewayProposalCanApprove(pending),true);
  assert.deepEqual(gatewayProposalApprovalRequest(pending),{expectedProposalId:'proposal-pending',expectedBaseConfigVersion:4});
  assert.equal(gatewayProposalCanApprove(proposalSnapshot('stale',3)),false);
  assert.throws(()=>gatewayProposalApprovalRequest(proposalSnapshot('stale',3)),/stale/i);
});

test('rejection requires a non-empty bounded reason and uses system components',()=>{
  assert.equal(validateGatewayProposalRejection(' wiring does not match '),'wiring does not match');
  assert.throws(()=>validateGatewayProposalRejection('   '),/reason/i);
  assert.throws(()=>validateGatewayProposalRejection('x'.repeat(2049)),/2,048/i);
  const source=readFileSync(new URL('gateway-config-proposals.tsx',import.meta.url),'utf8');
  for(const component of ['Card','Badge','DataTable','AlertDialog','Button','Field','Textarea'])assert.match(source,new RegExp(component));
  assert.doesNotMatch(source,/<(?:input|select|table|dialog|textarea)\b/);
  assert.doesNotMatch(source,/\b(?:bg|text)-(?:red|green|amber|blue|emerald)-/);
});

test('Thai proposal validation, load and action errors never fall back to English',()=>{
  assert.throws(()=>validateGatewayProposalRejection('   ','th'),/กรุณาระบุเหตุผล/);
  assert.throws(()=>validateGatewayProposalRejection('x'.repeat(2049),'th'),/2,048/);
  for(const kind of ['load','approve','reject'] as const){
    const message=gatewayProposalErrorMessage(kind,{status:409,message:'Proposal changed; refresh before approval'},'th');
    assert.match(message,/[ก-๙]/);
    assert.doesNotMatch(message,/[A-Za-z]/);
  }
});
