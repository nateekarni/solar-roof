import type {PayloadRevision} from './payload-contracts';
import {selectDevicePreset,type DeviceDraft} from './site-form-values';

/** The picker owns a filtered snapshot; its mutations must retain every unrelated family. */
export function mergeDevicePresetCatalog(catalog:PayloadRevision[],visible:PayloadRevision[],updated:PayloadRevision[]):PayloadRevision[]{
 const replacedIds=new Set([...visible,...updated].map(revision=>revision.id));
 const remainingFamilies=new Set(updated.map(revision=>revision.profileId));
 const archivedFamilies=new Set(visible.filter(revision=>!remainingFamilies.has(revision.profileId)).map(revision=>revision.profileId));
 return [...catalog.filter(revision=>!replacedIds.has(revision.id)&&!archivedFamilies.has(revision.profileId)),...updated];
}

/** A saved revision can arrive before the parent's catalogue props have rerendered. */
export function selectDevicePresetById(draft:DeviceDraft,id:string,catalog:PayloadRevision[],confirmed=false,selectedRevision?:PayloadRevision){
 const revision=id?(selectedRevision?.id===id?selectedRevision:catalog.find(row=>row.id===id)):undefined;
 if(id&&!revision)throw new Error('Preset unavailable. Reload the catalogue and select again.');
 return selectDevicePreset(draft,revision,confirmed);
}

export function publishSavedPreset(saved:PayloadRevision,rows:PayloadRevision[],update:(rows:PayloadRevision[])=>void,select:(id:string,revision?:PayloadRevision)=>void){
 update([saved,...rows]);
 select(saved.id,saved);
}
