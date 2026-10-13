'use client';

import * as React from 'react';
import {cn} from '../../lib/utils';
import {brandingLogoSrc, getBrandingRevision, subscribeBranding} from './branding-logo';
export const BRAND_NAME = 'Solar Roof';
export function BrandMark({label, className}: {label?:string|undefined; className?:string}) {
  const revision = React.useSyncExternalStore(subscribeBranding, getBrandingRevision, () => 0);
  const src = brandingLogoSrc(revision);
  const [failedSrc, setFailedSrc] = React.useState<string>();
  return <img src={failedSrc === src ? '/brand/solar-roof-mark.png' : src} onError={() => setFailedSrc(src)} width={64} height={64} alt={label ?? ''} aria-hidden={label ? undefined : true} className={cn('shrink-0 object-contain',className)}/>;
}
