/** Immutable v1 conversion catalogue. Scale/offset convert to the group's base unit. */
const groups = [
  [["Wh",1,0],["kWh",1000,0],["MWh",1e6,0]],
  [["varh",1,0],["kvarh",1000,0],["Mvarh",1e6,0]],
  [["W",1,0],["kW",1000,0],["MW",1e6,0]],
  [["var",1,0],["kvar",1000,0],["Mvar",1e6,0]],
  [["VA",1,0],["kVA",1000,0],["MVA",1e6,0]],
  [["V",1,0],["kV",1000,0],["mV",.001,0]],
  [["A",1,0],["mA",.001,0],["kA",1000,0]],
  [["Hz",1,0],["kHz",1000,0]],
  [["°C",1,273.15],["°F",5/9,273.15-32*5/9],["K",1,0]],
  [["m/s",1,0],["km/h",1/3.6,0]],
  [["W/m²",1,0],["kW/m²",1000,0]],
  [["ratio",1,0],["%",.01,0]],
] as const;
const aliases:Record<string,string> = {degC:"°C",degF:"°F","W/m2":"W/m²","kW/m2":"kW/m²","-":"ratio","1":"ratio"};
export const sourceUnits = [...groups.flatMap(g=>g.map(u=>u[0])), ...Object.keys(aliases)];
const canonical=(unit:string)=>aliases[unit]??unit;
export function compatibleUnits(source:string):string[] {
  if (!source) return [];
  const group=groups.find(g=>g.some(u=>u[0]===canonical(source)));
  return group ? [...new Set([source,...group.map(u=>u[0]),...Object.keys(aliases).filter(alias=>group.some(u=>u[0]===aliases[alias]))])] : [source];
}
export function convertUnit(value:number,source:string,target:string):number {
  if (!Number.isFinite(value) || !source || !target || !compatibleUnits(source).includes(target)) throw new Error("Unsupported unit conversion");
  if(source===target)return value;
  const group=groups.find(g=>g.some(u=>u[0]===canonical(source)))!;
  const from=group.find(u=>u[0]===canonical(source))!,to=group.find(u=>u[0]===canonical(target))!;
  const result=(value*from[1]+from[2]-to[2])/to[1];
  if(!Number.isFinite(result))throw new Error("Nonfinite converted value");
  return result;
}
export function derivedConversion(source:string,target:string):"identity"|"wh-to-kwh"|"varh-to-kvarh"|"auto-v1" {
  if(!source || !target || !compatibleUnits(source).includes(target))throw new Error("Unsupported unit conversion");
  return source===target?"identity":source==="Wh"&&target==="kWh"?"wh-to-kwh":source==="varh"&&target==="kvarh"?"varh-to-kvarh":"auto-v1";
}
