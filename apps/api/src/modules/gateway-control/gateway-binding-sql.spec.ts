import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {BIND_APPLIED_DEVICES_SQL} from './gateway-configuration.service.js';

const gatewayId='11111111-1111-4111-8111-111111111111';
const otherOwner='99999999-9999-4999-8999-999999999999';
const devices=[
  {externalId:'SHARED',id:'22222222-2222-4222-8222-222222222221',profileId:'33333333-3333-4333-8333-333333333331',owner:null},
  {externalId:'OWNED-SAME',id:'22222222-2222-4222-8222-222222222222',profileId:'33333333-3333-4333-8333-333333333332',owner:'22222222-2222-4222-8222-222222222222'},
  {externalId:'OWNED-OTHER',id:'22222222-2222-4222-8222-222222222223',profileId:'33333333-3333-4333-8333-333333333333',owner:otherOwner},
] as const;
const mapping={tag:'energy.active.import.total',displayName:'Import energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',
  conversion:'wh-to-kwh',role:'billing-import',registerAddress:'3204',registerCount:2,dataType:'uint32',byteOrder:'big_endian',
  wordOrder:'big_word_first',scale:0.01,offset:2};
const config={schemaVersion:'1.1',messageType:'config',messageId:'cfg',gatewayId:'GW-001',siteId:'SITE-001',configVersion:1,
  configHash:'a'.repeat(64),issuedAt:'2026-10-20T00:00:00.000Z',approvedBy:'admin',devices:devices.map(device=>({deviceId:device.externalId,
    enabled:true,mappingSource:'manual',deviceType:'energy-meter',model:'PM2230',serialNumber:`SERIAL-${device.externalId}`,
    protocol:'modbus-tcp',connection:{host:'192.0.2.10',port:502,slaveId:1},pollGroups:['energy'],profileId:'sender-meter',
    profileVersion:'1.0.0',mappings:[mapping]}))};
const profile={id:'local-profile',version:'1.0.0',sourceProfile:{id:'sender-meter',version:'1.0.0'},schemaVersion:'1.1',
  displayName:'PM2230',deviceType:'energy-meter',pollGroups:['energy'],fields:[{tag:mapping.tag,displayName:mapping.displayName,
    pollGroup:mapping.pollGroup,sourceUnit:mapping.sourceUnit,targetUnit:mapping.targetUnit,conversion:mapping.conversion,
    role:mapping.role,registerAddress:mapping.registerAddress}]};

async function seed(db:PGlite,withGateway:boolean) {
  await db.exec(`
    CREATE TABLE gateway_configuration_revisions(gateway_id uuid NOT NULL,version integer NOT NULL,config jsonb NOT NULL,
      desired_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(gateway_id,version));
    CREATE TABLE devices(id uuid PRIMARY KEY,gateway_id uuid NOT NULL,external_device_id text NOT NULL,
      payload_profile_revision_id uuid,status text NOT NULL);
    CREATE TABLE payload_profile_revisions(id uuid PRIMARY KEY,owner_device_id uuid,config jsonb NOT NULL);
    CREATE TABLE register_mapping_versions(id uuid PRIMARY KEY,device_id uuid NOT NULL,semantic_field text NOT NULL,
      register_address text NOT NULL,register_count integer NOT NULL,data_type text NOT NULL,byte_order text NOT NULL,
      word_order text NOT NULL,scale numeric(20,8) NOT NULL,unit text NOT NULL,quality_rule jsonb NOT NULL,signed boolean NOT NULL,
      effective_to timestamptz);
    ${withGateway?'CREATE TABLE gateways(id uuid PRIMARY KEY,applied_config_version integer NOT NULL);':''}
  `);
  await db.query('INSERT INTO gateway_configuration_revisions(gateway_id,version,config) VALUES($1,1,$2::jsonb)',[gatewayId,JSON.stringify(config)]);
  if(withGateway)await db.query('INSERT INTO gateways(id,applied_config_version) VALUES($1,1)',[gatewayId]);
  for(const [index,device] of devices.entries()){
    await db.query('INSERT INTO payload_profile_revisions(id,owner_device_id,config) VALUES($1,$2,$3::jsonb)',
      [device.profileId,device.owner,JSON.stringify(profile)]);
    await db.query(`INSERT INTO devices(id,gateway_id,external_device_id,payload_profile_revision_id,status)
      VALUES($1,$2,$3,$4,'online')`,[device.id,gatewayId,device.externalId,device.profileId]);
    await db.query(`INSERT INTO register_mapping_versions(id,device_id,semantic_field,register_address,register_count,data_type,
      byte_order,word_order,scale,unit,quality_rule,signed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,false)`,
    [`44444444-4444-4444-8444-44444444444${index}`,device.id,mapping.tag,mapping.registerAddress,mapping.registerCount,
      mapping.dataType,mapping.byteOrder,mapping.wordOrder,mapping.scale,mapping.sourceUnit,
      JSON.stringify({pollGroup:mapping.pollGroup,offset:mapping.offset})]);
  }
}

async function bound(db:PGlite){
  return (await db.query<{external_device_id:string}>('SELECT external_device_id FROM gateway_configuration_device_bindings ORDER BY external_device_id')).rows.map(row=>row.external_device_id);
}

async function setPollGroups(db:PGlite,profileGroups:string[],configGroups:string[],onlyShared=false){
  const nextConfig=structuredClone(config);
  if(onlyShared)nextConfig.devices=nextConfig.devices.slice(0,1);
  for(const device of nextConfig.devices)device.pollGroups=configGroups;
  const nextProfile={...profile,pollGroups:profileGroups};
  await db.query('UPDATE gateway_configuration_revisions SET config=$2::jsonb WHERE gateway_id=$1',[gatewayId,JSON.stringify(nextConfig)]);
  await db.query('UPDATE payload_profile_revisions SET config=$1::jsonb',[JSON.stringify(nextProfile)]);
}

test('runtime binding accepts shared or same-device revisions and rejects another-device ownership',async()=>{
  const db=new PGlite();
  try{
    await seed(db,false);
    await setPollGroups(db,['energy','realtime'],['realtime','energy']);
    await db.exec(`CREATE TABLE gateway_configuration_device_bindings(gateway_id uuid NOT NULL,config_version integer NOT NULL,
      external_device_id text NOT NULL,device_id uuid NOT NULL,profile_revision_id uuid NOT NULL,
      PRIMARY KEY(gateway_id,config_version,external_device_id),UNIQUE(gateway_id,config_version,device_id));`);
    await db.query(BIND_APPLIED_DEVICES_SQL,[gatewayId,1]);
    assert.deepEqual(await bound(db),['OWNED-SAME','SHARED']);
    await db.query(BIND_APPLIED_DEVICES_SQL,[gatewayId,1]);
    assert.deepEqual(await bound(db),['OWNED-SAME','SHARED']);
  }finally{await db.close();}
});

test('runtime binding accepts logical telemetry mappings without physical register decoder rows',async()=>{
  const db=new PGlite();
  try{
    await seed(db,false);
    const logicalConfig=structuredClone(config);
    for(const device of logicalConfig.devices)for(const field of device.mappings){
      for(const key of ['registerAddress','registerCount','dataType','byteOrder','wordOrder','scale','offset'] as const){
        delete (field as Record<string,unknown>)[key];
      }
    }
    const logicalProfile=structuredClone(profile);
    for(const field of logicalProfile.fields)delete (field as Record<string,unknown>).registerAddress;
    await db.query('UPDATE gateway_configuration_revisions SET config=$2::jsonb WHERE gateway_id=$1',[gatewayId,JSON.stringify(logicalConfig)]);
    await db.query('UPDATE payload_profile_revisions SET config=$1::jsonb',[JSON.stringify(logicalProfile)]);
    await db.exec('TRUNCATE register_mapping_versions');
    await db.exec(`CREATE TABLE gateway_configuration_device_bindings(gateway_id uuid NOT NULL,config_version integer NOT NULL,
      external_device_id text NOT NULL,device_id uuid NOT NULL,profile_revision_id uuid NOT NULL,
      PRIMARY KEY(gateway_id,config_version,external_device_id),UNIQUE(gateway_id,config_version,device_id));`);
    await db.query(BIND_APPLIED_DEVICES_SQL,[gatewayId,1]);
    assert.deepEqual(await bound(db),['OWNED-SAME','SHARED']);
  }finally{await db.close();}
});

test('runtime poll groups are an order-independent unique set with exact membership',async()=>{
  const db=new PGlite();
  try{
    await seed(db,false);
    await db.exec(`CREATE TABLE gateway_configuration_device_bindings(gateway_id uuid NOT NULL,config_version integer NOT NULL,
      external_device_id text NOT NULL,device_id uuid NOT NULL,profile_revision_id uuid NOT NULL,
      PRIMARY KEY(gateway_id,config_version,external_device_id),UNIQUE(gateway_id,config_version,device_id));`);
    for(const [profileGroups,configGroups,expected] of [
      [['energy','realtime'],['realtime','energy'],['SHARED']],
      [['energy'],['realtime','energy'],[]],
      [['energy','realtime','diagnostic'],['realtime','energy'],[]],
      [['energy','energy'],['energy','energy'],[]],
    ] as const){
      await db.exec('TRUNCATE gateway_configuration_device_bindings');
      await setPollGroups(db,[...profileGroups],[...configGroups],true);
      await db.query(BIND_APPLIED_DEVICES_SQL,[gatewayId,1]);
      assert.deepEqual(await bound(db),expected);
    }
  }finally{await db.close();}
});

test('migration 068 backfill has the same ownership boundary and is rerun-idempotent',async()=>{
  const db=new PGlite();
  try{
    await seed(db,true);
    await setPollGroups(db,['energy','realtime'],['realtime','energy']);
    const sql=await readFile(new URL('../../../../../infra/migrations/068_gateway_control_rollout_and_bindings.sql',import.meta.url),'utf8');
    await db.exec(sql);
    assert.deepEqual(await bound(db),['OWNED-SAME','SHARED']);
    await db.exec(sql);
    assert.deepEqual(await bound(db),['OWNED-SAME','SHARED']);
    for(const [profileGroups,configGroups] of [
      [['energy'],['realtime','energy']],
      [['energy','realtime','diagnostic'],['realtime','energy']],
      [['energy','energy'],['energy','energy']],
    ] as const){
      await db.exec('TRUNCATE gateway_configuration_device_bindings');
      await setPollGroups(db,[...profileGroups],[...configGroups],true);
      await db.exec(sql);
      assert.deepEqual(await bound(db),[]);
    }
  }finally{await db.close();}
});
