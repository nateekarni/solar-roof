export function telemetryAge(value: unknown, locale: string, now = Date.now()): {text:string;fresh:boolean} {
  const timestamp=typeof value==='string'?Date.parse(value):value instanceof Date?value.getTime():NaN;
  if (!Number.isFinite(timestamp)) return {text:locale==='th'?'ยังไม่มีข้อมูล':'No telemetry',fresh:false};
  const seconds=Math.floor((now-timestamp)/1000);
  if (seconds<0) return {text:locale==='th'?'เวลาอุปกรณ์ไม่ถูกต้อง':'Device time is in the future',fresh:false};
  const amount=seconds<60?seconds:seconds<3600?Math.floor(seconds/60):seconds<86400?Math.floor(seconds/3600):Math.floor(seconds/86400);
  const unit=seconds<60?'second':seconds<3600?'minute':seconds<86400?'hour':'day';
  return {text:new Intl.RelativeTimeFormat(locale==='th'?'th-TH':'en-US',{numeric:'always'}).format(-amount,unit),fresh:seconds<=120};
}
