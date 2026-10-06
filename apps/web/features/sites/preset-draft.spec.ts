import test from 'node:test';
import assert from 'node:assert/strict';
import {editPresetDraft,presetFromPayload,mergePresetCatalog,presetDeviceType} from './preset-draft';
test('editing preset increments local version and pins unchanged Gateway source profile',()=>{
 const config={id:'pilot-spm91',version:'1.0.0',schemaVersion:'1.1' as const,displayName:'Pilot',deviceType:'energy-meter',pollGroups:['energy'],fields:[]};
 const r={id:'revision',profileId:config.id,version:config.version,config,createdAt:''};
 const edited=editPresetDraft(r,[r]);assert.equal(edited.version,'1.0.1');assert.deepEqual(edited.sourceProfile,{id:'pilot-spm91',version:'1.0.0'});assert.equal(config.version,'1.0.0');
});
test('payload inference reads literal dotted keys without inventing fields and creates billing role',()=>{
 const profile=presetFromPayload({messageType:'telemetry',device:{deviceId:'SPM91-01',profileId:'pilot-spm91',profileVersion:'1.0.0',deviceType:'energy-meter'},pollGroup:'energy',data:{values:{'energy.active.import.total':1700},units:{'energy.active.import.total':'Wh'}}});
 assert.equal(profile.fields.length,1);assert.equal(profile.fields[0]?.conversion,'wh-to-kwh');assert.equal(profile.fields[0]?.role,'billing-import');assert.equal(profile.fields[0]?.targetUnit,'kWh');
});
test('filtered catalogue edits preserve logger presets and archived bindings still have compatible choices',()=>{
 const base={id:'meter',profileId:'meter',version:'1.0.0',createdAt:'',config:{id:'meter',version:'1.0.0',schemaVersion:'1.1' as const,displayName:'Meter',deviceType:'energy-meter',pollGroups:['energy'],fields:[]}};
 const logger={...base,id:'logger',profileId:'logger',config:{...base.config,id:'logger',deviceType:'solar-logger'}};
 assert.deepEqual(mergePresetCatalog([base,logger],[],'energy-meter'),[logger]);
 assert.equal(presetDeviceType([logger],{profileRevisionId:'archived',profileDeviceType:'energy-meter'}),'energy-meter');
});
