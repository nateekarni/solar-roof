import assert from 'node:assert/strict';
import test from 'node:test';
import {mergeDevicePresetCatalog,publishSavedPreset,selectDevicePresetById} from './device-preset-selection';
import {newDeviceDraft,selectDevicePreset} from './site-form-values';
import type {PayloadRevision} from './payload-contracts';
const meter:PayloadRevision={id:'meter-r1',profileId:'meter',version:'1.0.0',createdAt:'',config:{id:'meter',version:'1.0.0',schemaVersion:'1.1',displayName:'Meter model',deviceType:'energy-meter',pollGroups:['energy'],fields:[{tag:'energy.active.import.total',displayName:'Energy',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import'}]}};
const logger:PayloadRevision={...meter,id:'logger-r1',profileId:'logger',config:{...meter.config,id:'logger',displayName:'Logger model',deviceType:'solar-logger'}};
const saved:PayloadRevision={...meter,id:'meter-r2',version:'1.0.1',config:{...meter.config,version:'1.0.1',displayName:'New meter model',fields:[{...meter.config.fields[0]!,displayName:'New field'}]}};
test('filtered save merges into full catalogue and immediately selects returned revision before parent rerenders',()=>{
 const created:PayloadRevision={...saved,id:'created-r1',profileId:'created',version:'1.0.0',config:{...saved.config,id:'created',version:'1.0.0'}};
 const renderCatalog=[meter,logger],visible=[meter];let parentCatalog=renderCatalog;let draft=newDeviceDraft();draft.externalDeviceId='REAL-ID';draft.serialNumber='REAL-SERIAL';
 publishSavedPreset(created,visible,updated=>{parentCatalog=mergeDevicePresetCatalog(renderCatalog,visible,updated);},(id,revision)=>{draft=selectDevicePresetById(draft,id,renderCatalog,false,revision)!;});
 assert.equal(draft.payloadProfileRevisionId,'created-r1');assert.equal(draft.sourcePresetRevisionId,'created-r1');assert.equal(draft.name,'New meter model');assert.equal(draft.model,'New meter model');assert.equal(draft.config.fields[0]!.displayName,'New field');assert.equal(draft.externalDeviceId,'REAL-ID');assert.equal(draft.serialNumber,'REAL-SERIAL');assert.deepEqual(parentCatalog.map(r=>r.id).sort(),['created-r1','logger-r1','meter-r1']);
});
test('filtered archive removes the preset family and keeps another type and its sibling draft selected',()=>{
 const sibling=selectDevicePreset(newDeviceDraft(),logger,true)!;const full=[meter,saved,logger];const updated=mergeDevicePresetCatalog(full,[meter,saved],[]);
 assert.deepEqual(updated,[logger]);assert.equal(selectDevicePresetById(sibling,'logger-r1',updated)?.payloadProfileRevisionId,'logger-r1');assert.equal(sibling.sourcePresetRevisionId,'logger-r1');assert.equal(sibling.config.displayName,'Logger model');
});
test('unknown nonempty revision cannot silently switch a configured device to manual',()=>{
 const draft=selectDevicePreset(newDeviceDraft(),meter,true)!;assert.throws(()=>selectDevicePresetById(draft,'missing',[]),/unavailable/i);assert.equal(draft.sourcePresetRevisionId,'meter-r1');assert.equal(selectDevicePresetById(draft,'',[])?.sourcePresetRevisionId,undefined);
});
test('a newly saved preset remains available through dirty-edit overwrite confirmation',()=>{
 const draft=selectDevicePreset(newDeviceDraft(),meter,true)!;draft.model='Edited';draft.dirty=true;
 assert.equal(selectDevicePresetById(draft,saved.id,[meter],false,saved),null);
 const confirmed=selectDevicePresetById(draft,saved.id,[meter],true,saved)!;assert.equal(confirmed.model,'New meter model');assert.equal(confirmed.sourcePresetRevisionId,'meter-r2');
});

test('archive removes hidden versions of that family while retaining unrelated types',()=>{
 const hiddenFamilyVersion:PayloadRevision={...meter,id:'meter-old-type',config:{...meter.config,deviceType:'old-meter-type'}};
 const merged=mergeDevicePresetCatalog([meter,hiddenFamilyVersion,logger],[meter],[]);
 assert.deepEqual(merged.map(revision=>revision.id),['logger-r1']);
});
