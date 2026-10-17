export interface TelemetryTagMeta {
  th: string;
  en: string;
  category: 'power' | 'energy' | 'electrical' | 'environment' | 'general';
}

export const TELEMETRY_TAG_LABELS: Record<string, TelemetryTagMeta> = {
  // Solar & Inverter / Logger
  'solar.active_power': { th: 'กำลังผลิตไฟฟ้าจริง', en: 'Solar Active Power', category: 'power' },
  'solar.reactive_power': { th: 'กำลังไฟฟ้ารีแอกทีฟ', en: 'Solar Reactive Power', category: 'power' },
  'solar.daily_yield': { th: 'พลังงานผลิตประจำวัน', en: 'Daily Yield', category: 'energy' },
  'solar.total_yield': { th: 'พลังงานผลิตสะสม', en: 'Total Yield', category: 'energy' },
  'environment.irradiance': { th: 'ความเข้มแสงอาทิตย์', en: 'Solar Irradiance', category: 'environment' },
  'environment.ambient_temperature': { th: 'อุณหภูมิแวดล้อม', en: 'Ambient Temperature', category: 'environment' },
  'environment.module_temperature': { th: 'อุณหภูมิแผงโซลาร์', en: 'Module Temperature', category: 'environment' },
  'environment.wind_speed': { th: 'ความเร็วลม', en: 'Wind Speed', category: 'environment' },

  // Electrical Meter Measurements
  'electrical.voltage.l1_n': { th: 'แรงดันไฟฟ้า L1-N', en: 'Voltage L1-N', category: 'electrical' },
  'electrical.voltage.l2_n': { th: 'แรงดันไฟฟ้า L2-N', en: 'Voltage L2-N', category: 'electrical' },
  'electrical.voltage.l3_n': { th: 'แรงดันไฟฟ้า L3-N', en: 'Voltage L3-N', category: 'electrical' },
  'electrical.voltage.l1_l2': { th: 'แรงดันไฟฟ้า L1-L2', en: 'Voltage L1-L2', category: 'electrical' },
  'electrical.voltage.l2_l3': { th: 'แรงดันไฟฟ้า L2-L3', en: 'Voltage L2-L3', category: 'electrical' },
  'electrical.voltage.l3_l1': { th: 'แรงดันไฟฟ้า L3-L1', en: 'Voltage L3-L1', category: 'electrical' },
  'electrical.current.l1': { th: 'กระแสไฟฟ้า L1', en: 'Current L1', category: 'electrical' },
  'electrical.current.l2': { th: 'กระแสไฟฟ้า L2', en: 'Current L2', category: 'electrical' },
  'electrical.current.l3': { th: 'กระแสไฟฟ้า L3', en: 'Current L3', category: 'electrical' },
  'electrical.frequency': { th: 'ความถี่ไฟฟ้า', en: 'Frequency', category: 'electrical' },
  'power.active.total': { th: 'กำลังไฟฟ้าจริงรวม', en: 'Total Active Power', category: 'power' },
  'power.reactive.total': { th: 'กำลังไฟฟ้ารีแอกทีฟรวม', en: 'Total Reactive Power', category: 'power' },
  'power.apparent.total': { th: 'กำลังไฟฟ้าปรากฏรวม', en: 'Total Apparent Power', category: 'power' },
  'power.factor.total': { th: 'เพาเวอร์แฟกเตอร์', en: 'Power Factor', category: 'electrical' },
  'energy.active.import.total': { th: 'พลังงานนำเข้ารวม (คิดบิล)', en: 'Active Energy Import (Billing)', category: 'energy' },
  'energy.active.export.total': { th: 'พลังงานส่งออกรวม', en: 'Active Energy Export', category: 'energy' },
  'energy.reactive.import.total': { th: 'พลังงานรีแอกทีฟนำเข้ารวม', en: 'Reactive Energy Import', category: 'energy' },
  'energy.reactive.export.total': { th: 'พลังงานรีแอกทีฟส่งออกรวม', en: 'Reactive Energy Export', category: 'energy' },
};

export function getTelemetryTagLabel(tag: string, locale: 'th' | 'en' = 'th'): string {
  const meta = TELEMETRY_TAG_LABELS[tag];
  if (meta) return meta[locale] || meta.th;

  // Fallback: convert dotted string to title
  const parts = tag.split('.');
  const last = parts[parts.length - 1] || tag;
  return last.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
