import assert from 'node:assert/strict';
import test from 'node:test';
import { PayloadIngestion } from './payload-ingestion.js';

const topic='solar/v1/sites/SITE-001/gateways/GW-001/devices/SMARTLOGGER-001/telemetry';
const payload={schemaVersion:'1.2',messageType:'telemetry',messageId:'GW-001-1260',sequence:1260,lotNumber:1260,
  siteId:'SITE-001',gatewayId:'GW-001',gatewaySerial:'GW-SN-A1B2C3D4',device:{deviceId:'SMARTLOGGER-001',
    deviceSerial:'SL-SN-000001',deviceType:'solar-logger',manufacturer:'Huawei',model:'SmartLogger3000A',
    profileId:'huawei-smartlogger3000a',profileVersion:'1.0.0',protocol:'modbus-tcp'},pollGroup:'plant',
  timestamps:{polledAt:'2026-10-21T03:30:00Z',sentAt:'2026-10-21T03:30:01Z'},
  data:{values:{'solar.active_power':820400},units:{'solar.active_power':'W'}},quality:{status:'good',communication:'online'}};

test('unknown schema 1.2 telemetry creates serial discovery evidence without production acknowledgement',async()=>{
  const queries:{sql:string;values:unknown[]}[]=[];
  const discovery={id:'22222222-2222-4222-8222-222222222222',externalGatewayId:'GW-001',gatewaySerial:'GW-SN-A1B2C3D4',
    mqttBrokerId:null,clientId:'GW-SN-A1B2C3D4',reportedSiteId:'SITE-001',reportedDeviceId:'SMARTLOGGER-001',manufacturer:'Huawei',
    model:'SmartLogger3000A',profileId:'huawei-smartlogger3000a',protocol:'modbus-tcp',firmwareVersion:null,status:'unassigned',
    assignedSiteId:null,assignedGatewayId:null,assignedAt:null,sourceAddress:null,firstSeenAt:'2026-10-21T03:30:01Z',lastSeenAt:'2026-10-21T03:30:01Z',
    discoveryRevision:1,rawPayload:payload,devices:[]};
  const query=async(sql:string,values:unknown[]=[]):Promise<{rows:any[]}>=>{
    queries.push({sql,values});
    if(sql.includes('FROM devices d JOIN gateways'))return {rows:[]};
    if(sql.includes('FROM gateways g JOIN sites'))return {rows:[]};
    if(sql.includes('INSERT INTO discovered_gateways'))return {rows:[discovery]};
    return {rows:[]};
  };
  const db={query,transaction:async(work:(client:{query:typeof query})=>Promise<unknown>)=>work({query})};
  const acknowledgement=await new PayloadIngestion(db as any).accept(topic,payload,null);

  assert.equal(acknowledgement,null);
  assert.ok(queries.some(query=>query.sql.includes('INSERT INTO discovered_gateways')));
  assert.ok(queries.some(query=>query.sql.includes('INSERT INTO gateway_discovery_snapshots')));
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO payload_messages')),false);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO payload_samples')),false);
});

test('unknown schema 1.1 telemetry remains rejected and cannot create discovery evidence',async()=>{
  const queries:{sql:string;values:unknown[]}[]=[];
  const db={query:async(sql:string,values:unknown[]=[]):Promise<{rows:any[]}>=>{queries.push({sql,values});return {rows:[]};}};
  const legacy=structuredClone(payload) as any;
  legacy.schemaVersion='1.1';
  delete legacy.gatewaySerial;
  delete legacy.device.deviceSerial;

  assert.equal(await new PayloadIngestion(db as any).accept(topic,legacy,null),null);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO discovered_gateways')),false);
});
