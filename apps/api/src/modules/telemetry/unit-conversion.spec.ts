import assert from "node:assert/strict";
import test from "node:test";
import { compatibleUnits, convertUnit, derivedConversion } from "@solar/api-contracts/unit-conversion";
import { validatePayloadProfile } from "./payload-profile.js";

test("dependent choices isolate compatible dimensions and preserve custom identities",()=>{
  assert.deepEqual(compatibleUnits("Wh"),["Wh","kWh","MWh"]);
  assert.equal(compatibleUnits("Wh").includes("W"),false);
  assert.equal(compatibleUnits("Wh").includes("varh"),false);
  assert.deepEqual(compatibleUnits("custom"),["custom"]);
  assert.equal(convertUnit(2,"custom","custom"),2);
  assert.throws(()=>convertUnit(2,"custom","W"));
});
test("scale, reverse, offset and aliases use the same conversion calculation",()=>{
  for(const [source,target,value,expected] of [["Wh","kWh",12500,12.5],["MWh","Wh",2,2e6],["kW","W",2,2000],["mA","A",500,.5],["km/h","m/s",36,10],["%","ratio",50,.5],["degC","K",0,273.15],["°F","°C",32,0]] as const){
    assert.ok(Math.abs(convertUnit(value,source,target)-expected)<1e-9);
    assert.ok(Math.abs(convertUnit(expected,target,source)-value)<1e-9);
  }
  assert.throws(()=>convertUnit(Infinity,"Wh","kWh"));
  assert.throws(()=>convertUnit(1,"wh","kWh"));
});
test("legacy conversions remain valid and new conversions require an explicit immutable version",()=>{
  const field={tag:"temperature",displayName:"Temperature",pollGroup:"realtime",sourceUnit:"°F",targetUnit:"°C",conversion:"auto-v1"};
  const profile={id:"test",version:"1.0.0",schemaVersion:"1.1",displayName:"Test",deviceType:"sensor",pollGroups:["realtime"],fields:[field]};
  assert.equal(validatePayloadProfile(profile).fields[0]?.conversion,"auto-v1");
  assert.throws(()=>validatePayloadProfile({...profile,fields:[{...field,sourceUnit:"Wh",targetUnit:"kWh",conversion:"identity"}]}));
  assert.equal(derivedConversion("Wh","kWh"),"wh-to-kwh");
  assert.equal(derivedConversion("kW","W"),"auto-v1");
});
