// Fixture history is computed in kWh. Canonical payload units follow pinned profiles.
export function energySampleSpec(config,tag){
const field=config?.fields?.find(field=>field.tag===tag);
if(field?.sourceUnit==='Wh'&&field.targetUnit==='kWh'&&field.conversion==='wh-to-kwh')return {unit:'kWh',valueMultiplier:1};
if(field?.sourceUnit==='Wh'&&field.targetUnit==='Wh'&&field.conversion==='identity')return {unit:'Wh',valueMultiplier:1000};
throw Error(`Unsupported canonical energy mapping for ${tag}`);
}
