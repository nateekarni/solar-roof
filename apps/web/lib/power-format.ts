export type PowerDisplay = {value:string;unit:'W'|'kW'|'MW'|'';state:'measured'|'missing'};

/** ใช้หน่วยตามขนาดกำลังจริง ไม่ทำให้ค่าที่วัดได้เล็กน้อยกลายเป็นศูนย์ */
export function formatPower(watts:number|null,locale:'th'|'en'):PowerDisplay {
  if(watts===null || !Number.isFinite(watts)) {
    return {value:locale==='th'?'ไม่มีข้อมูล':'No data',unit:'',state:'missing'};
  }
  const magnitude=Math.abs(watts);
  if(magnitude>0 && magnitude<0.001) {
    return {value:watts<0?'>-0.001':'<0.001',unit:'W',state:'measured'};
  }
  const unit=magnitude<1000?'W':magnitude<1000000?'kW':'MW';
  const divisor=unit==='W'?1:unit==='kW'?1000:1000000;
  return {value:new Intl.NumberFormat(locale==='th'?'th-TH':'en-US',{maximumFractionDigits:3}).format(watts/divisor),unit,state:'measured'};
}
