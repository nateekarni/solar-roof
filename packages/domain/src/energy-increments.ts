export interface EnergyReading { at:string; kwh:number }
export type EnergyQuality = 'complete' | 'missing' | 'reset';
export function deriveIncrement(previous:EnergyReading|null,current:EnergyReading):{kwh:number|null;quality:EnergyQuality} {
  if (!previous || !Number.isFinite(previous.kwh) || !Number.isFinite(current.kwh) || previous.kwh < 0 || current.kwh < 0
    || !Number.isFinite(Date.parse(current.at)) || !Number.isFinite(Date.parse(previous.at)) || Date.parse(current.at)<=Date.parse(previous.at)) return {kwh:null,quality:'missing'};
  if (current.kwh<previous.kwh) return {kwh:null,quality:'reset'};
  return {kwh:current.kwh-previous.kwh,quality:'complete'};
}
