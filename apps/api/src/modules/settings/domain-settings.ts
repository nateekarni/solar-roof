import { BadRequestException } from '@nestjs/common';
import type { PermissionDomain } from '../../common/auth/authorization.js';
export const DOMAIN_SETTING_DEFAULTS:Record<PermissionDomain,Record<string,number|boolean>>={
 business:{documentRetentionYears:7,defaultUnitPriceThb:4.25},
 technical:{rawTelemetryRetentionYears:2,technicalAggregateRetentionYears:7,defaultFetchFrequencySec:60,criticalEmailAlert:false,inAppNotification:true,comparisonRelativeTolerance:0.05,comparisonEnergyAbsoluteFloor:0.1,comparisonPowerAbsoluteFloor:0.1,comparisonWindowSeconds:900,comparisonConsecutiveWindows:3},
};
export function validateSettingsPatch(domain:PermissionDomain,input:unknown):{revision:number;settings:Record<string,number|boolean>}{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['revision','settings'].includes(k)))throw new BadRequestException('Invalid settings patch');
 const body=input as {revision:number;settings:Record<string,number|boolean>};
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!body.settings||typeof body.settings!=='object'||Array.isArray(body.settings)||Object.keys(body.settings).length===0)throw new BadRequestException('Invalid settings revision or fields');
 for(const [key,value]of Object.entries(body.settings)){
  const expected=DOMAIN_SETTING_DEFAULTS[domain][key];
  if(expected===undefined||typeof expected!==typeof value)throw new BadRequestException('Unknown or cross-domain setting');
  const max=key==='comparisonRelativeTolerance'?1:key==='comparisonConsecutiveWindows'?20:key.endsWith('AbsoluteFloor')?Number.MAX_VALUE:['comparisonWindowSeconds','defaultFetchFrequencySec'].includes(key)?86400:key==='defaultUnitPriceThb'?100000:100;
  const min=key==='comparisonWindowSeconds'?900:['comparisonConsecutiveWindows','defaultFetchFrequencySec'].includes(key)?1:0;
  if(typeof value==='number'&&(!Number.isFinite(value)||value<min||value>max||(['comparisonWindowSeconds','comparisonConsecutiveWindows','defaultFetchFrequencySec'].includes(key)||key.endsWith('Years'))&&!Number.isInteger(value)))throw new BadRequestException('Invalid setting value');
 }
 return body;
}
