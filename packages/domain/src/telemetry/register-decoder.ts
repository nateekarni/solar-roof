export type WordOrder = "little_word_first" | "big_word_first" | "cdab" | "abcd";
export type ModbusDataType = "uint16" | "int16" | "uint32" | "int32" | "float32";

export interface RegisterFieldMapping {
  semanticField: string;
  nameTh?: string;
  registerAddress: string; // e.g. "R0", "0", "3000", "0x0000"
  registerCount?: number; // 1 for 16-bit, 2 for 32-bit
  wordOrder?: WordOrder; // little_word_first (CDAB) or big_word_first (ABCD)
  dataType: ModbusDataType | string;
  scale: number;
  unit: string;
}

export interface DecodedFieldResult {
  semanticField: string;
  registerAddress: string;
  rawRegisters: number[];
  rawValue: number;
  scaledValue: number;
  unit: string;
}

/**
 * Normalizes register key like "R0", "r2", "3000", "0x0010" to numeric index/address.
 */
export function parseRegisterIndex(address: string | number): number {
  if (typeof address === "number") return address;
  const str = address.trim();
  if (/^r\d+$/i.test(str)) {
    return parseInt(str.slice(1), 10);
  }
  if (/^0x/i.test(str)) {
    return parseInt(str, 16);
  }
  if (/^[0-9a-f]+h$/i.test(str)) {
    return parseInt(str.slice(0, -1), 16);
  }
  return parseInt(str, 10);
}

/**
 * Decodes 16-bit or 32-bit Modbus registers into numeric raw & scaled value.
 */
export function decodeModbusValue(
  rawRegisters: number[],
  dataType: string,
  wordOrder: WordOrder = "little_word_first",
  scale: number = 1.0
): { rawValue: number; scaledValue: number } {
  if (!rawRegisters || rawRegisters.length === 0) {
    throw new Error("Cannot decode empty registers");
  }

  const normalizedDataType = dataType.toLowerCase();
  const is32Bit =
    normalizedDataType.includes("32") ||
    normalizedDataType.includes("float") ||
    rawRegisters.length >= 2;

  let raw = 0;

  if (!is32Bit) {
    // 16-bit register
    const reg = (rawRegisters[0] ?? 0) & 0xffff;
    if (normalizedDataType === "int16") {
      // 16-bit signed
      raw = reg >= 0x8000 ? reg - 0x10000 : reg;
    } else {
      // uint16
      raw = reg;
    }
  } else {
    // 32-bit register from 2x 16-bit words
    const w0 = (rawRegisters[0] ?? 0) & 0xffff;
    const w1 = (rawRegisters[1] ?? 0) & 0xffff;

    let lowWord = 0;
    let highWord = 0;

    const isLittleWord =
      wordOrder === "little_word_first" || wordOrder === "cdab";

    if (isLittleWord) {
      lowWord = w0;
      highWord = w1;
    } else {
      highWord = w0;
      lowWord = w1;
    }

    if (normalizedDataType === "float32") {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint16(0, highWord, false);
      view.setUint16(2, lowWord, false);
      raw = view.getFloat32(0, false);
    } else if (normalizedDataType === "int32") {
      // 32-bit signed: bitwise OR forces signed 32-bit integer in JS
      raw = (highWord << 16) | lowWord;
    } else {
      // uint32 (unsigned)
      raw = ((highWord << 16) >>> 0) + lowWord;
    }
  }

  const scaledValue = Number((raw * scale).toFixed(4));
  return { rawValue: raw, scaledValue };
}

/**
 * Decodes an entire register map/array against a list of field mappings.
 */
export function decodeRegisterBatch(
  registers: Record<string, number> | number[],
  mappings: RegisterFieldMapping[]
): Record<string, DecodedFieldResult> {
  const regMap = new Map<number, number>();

  if (Array.isArray(registers)) {
    registers.forEach((val, idx) => regMap.set(idx, val));
  } else if (typeof registers === "object" && registers !== null) {
    for (const [key, val] of Object.entries(registers)) {
      const idx = parseRegisterIndex(key);
      if (!Number.isNaN(idx)) {
        regMap.set(idx, Number(val));
      }
    }
  }

  const results: Record<string, DecodedFieldResult> = {};

  for (const mapping of mappings) {
    const baseIndex = parseRegisterIndex(mapping.registerAddress);
    if (Number.isNaN(baseIndex)) continue;

    const count =
      mapping.registerCount ??
      (mapping.dataType.toLowerCase().includes("32") ||
      mapping.dataType.toLowerCase().includes("float")
        ? 2
        : 1);

    const words: number[] = [];
    let hasAll = true;

    for (let i = 0; i < count; i++) {
      const targetIdx = baseIndex + i;
      if (!regMap.has(targetIdx)) {
        hasAll = false;
        break;
      }
      words.push(regMap.get(targetIdx)!);
    }

    if (!hasAll || words.length === 0) continue;

    const decoded = decodeModbusValue(
      words,
      mapping.dataType,
      mapping.wordOrder ?? "little_word_first",
      mapping.scale
    );

    results[mapping.semanticField] = {
      semanticField: mapping.semanticField,
      registerAddress: mapping.registerAddress,
      rawRegisters: words,
      rawValue: decoded.rawValue,
      scaledValue: decoded.scaledValue,
      unit: mapping.unit,
    };
  }

  return results;
}
