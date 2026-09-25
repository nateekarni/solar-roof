import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeModbusValue,
  decodeRegisterBatch,
  parseRegisterIndex,
  type RegisterFieldMapping,
} from "../src/telemetry/register-decoder.js";

describe("Modbus Register Decoder Engine", () => {
  it("parses various register address notations", () => {
    assert.equal(parseRegisterIndex("R0"), 0);
    assert.equal(parseRegisterIndex("R12"), 12);
    assert.equal(parseRegisterIndex("3000"), 3000);
    assert.equal(parseRegisterIndex("0x0010"), 16);
    assert.equal(parseRegisterIndex("0010H"), 16);
    assert.equal(parseRegisterIndex(45), 45);
  });

  it("accurately decodes 16-bit uint and int registers", () => {
    // Voltage: 23081 with scale 0.01 -> 230.81 V
    const v = decodeModbusValue([23081], "uint16", "little_word_first", 0.01);
    assert.equal(v.scaledValue, 230.81);

    // Frequency: 5000 with scale 0.01 -> 50.00 Hz
    const hz = decodeModbusValue([5000], "uint16", "little_word_first", 0.01);
    assert.equal(hz.scaledValue, 50);

    // Power Factor: 906 with scale 0.001 -> 0.906
    const pf = decodeModbusValue([906], "int16", "little_word_first", 0.001);
    assert.equal(pf.scaledValue, 0.906);
  });

  it("accurately decodes 32-bit registers (little-word-first CDAB) from PILOT SPM91", () => {
    // Total Active Energy: R0=2, R1=0, scale 0.1 -> 0.20 kWh
    const energy = decodeModbusValue([2, 0], "uint32", "little_word_first", 0.1);
    assert.equal(energy.scaledValue, 0.2);

    // Current: R3=443, R4=0, scale 0.001 -> 0.443 A
    const current = decodeModbusValue([443, 0], "uint32", "little_word_first", 0.001);
    assert.equal(current.scaledValue, 0.443);

    // Active Power: R5=878, R6=0, scale 0.1 -> 87.8 W
    const power = decodeModbusValue([878, 0], "int32", "little_word_first", 0.1);
    assert.equal(power.scaledValue, 87.8);

    // Apparent Power: R7=1025, R8=0, scale 0.1 -> 102.5 VA
    const va = decodeModbusValue([1025, 0], "uint32", "little_word_first", 0.1);
    assert.equal(va.scaledValue, 102.5);

    // Reactive Power: R9=65127, R10=65535, scale 0.1 -> -40.9 var
    // Low: 65127 (0xFE67), High: 65535 (0xFFFF) => signed 32-bit: -409
    const reactive = decodeModbusValue([65127, 65535], "int32", "little_word_first", 0.1);
    assert.equal(reactive.rawValue, -409);
    assert.equal(reactive.scaledValue, -40.9);
  });

  it("decodes complete PILOT SPM91 telemetry register batch exactly matching gateway OCR", () => {
    const rawRegisters: Record<string, number> = {
      R0: 2,
      R1: 0,
      R2: 23081,
      R3: 443,
      R4: 0,
      R5: 878,
      R6: 0,
      R7: 1025,
      R8: 0,
      R9: 65127,
      R10: 65535,
      R11: 5000,
      R12: 906,
    };

    const spm91Mappings: RegisterFieldMapping[] = [
      { semanticField: "total_energy", registerAddress: "R0", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.1, unit: "kWh" },
      { semanticField: "voltage", registerAddress: "R2", registerCount: 1, wordOrder: "little_word_first", dataType: "uint16", scale: 0.01, unit: "V" },
      { semanticField: "current", registerAddress: "R3", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.001, unit: "A" },
      { semanticField: "active_power", registerAddress: "R5", registerCount: 2, wordOrder: "little_word_first", dataType: "int32", scale: 0.1, unit: "W" },
      { semanticField: "apparent_power", registerAddress: "R7", registerCount: 2, wordOrder: "little_word_first", dataType: "uint32", scale: 0.1, unit: "VA" },
      { semanticField: "reactive_power", registerAddress: "R9", registerCount: 2, wordOrder: "little_word_first", dataType: "int32", scale: 0.1, unit: "var" },
      { semanticField: "frequency", registerAddress: "R11", registerCount: 1, wordOrder: "little_word_first", dataType: "uint16", scale: 0.01, unit: "Hz" },
      { semanticField: "power_factor", registerAddress: "R12", registerCount: 1, wordOrder: "little_word_first", dataType: "int16", scale: 0.001, unit: "" },
    ];

    const decoded = decodeRegisterBatch(rawRegisters, spm91Mappings);

    assert.equal(decoded.total_energy?.scaledValue, 0.2);
    assert.equal(decoded.voltage?.scaledValue, 230.81);
    assert.equal(decoded.current?.scaledValue, 0.443);
    assert.equal(decoded.active_power?.scaledValue, 87.8);
    assert.equal(decoded.apparent_power?.scaledValue, 102.5);
    assert.equal(decoded.reactive_power?.scaledValue, -40.9);
    assert.equal(decoded.frequency?.scaledValue, 50);
    assert.equal(decoded.power_factor?.scaledValue, 0.906);
  });
});
