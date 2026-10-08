import * as React from 'react';
import {BRAND_NAME} from './brand-mark';
export interface DocumentCompanyLogo {logoUrl?:string|null;logo_url?:string|null;companyName?:string;company_name?:string;}
export function DocumentBrand({issued,company}: {issued:boolean;company?:DocumentCompanyLogo}) {
  const savedLogo=company?.logoUrl?.trim() || company?.logo_url?.trim();
  const src=savedLogo || (issued ? undefined : '/brand/solar-roof-document.png');
  if(!src)return null;
  return <img src={src} alt={savedLogo ? (company?.companyName || company?.company_name || 'Issuer logo') : BRAND_NAME} className="document-brand mb-4 h-16 w-auto max-w-64 object-contain"/>;
}
