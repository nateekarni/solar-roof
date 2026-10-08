import * as React from 'react';
import {cn} from '../../lib/utils';
export const BRAND_NAME = 'Solar Roof';
export function BrandMark({label, className}: {label?:string|undefined; className?:string}) {
  return <img src="/brand/solar-roof-mark.png" width={64} height={64} alt={label ?? ''} aria-hidden={label ? undefined : true} className={cn('shrink-0 object-contain',className)}/>;
}
