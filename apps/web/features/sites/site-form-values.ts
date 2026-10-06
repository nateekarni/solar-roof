export function emptySiteValues(): { name: string; schoolName: string; capacityMwp?: number; latitude?: number; longitude?: number; gatewayName: string; protocol: string; endpoint: string; meterPresetId: string; deviceModel: string; deviceSerial: string } {
  return { name: '', schoolName: '', gatewayName: '', protocol: '', endpoint: '', meterPresetId: '', deviceModel: '', deviceSerial: '' };
}
export function optionalNumber(value: string | number | null | undefined) { return value == null || (typeof value === 'string' && value.trim() === '') ? undefined : Number(value); }
