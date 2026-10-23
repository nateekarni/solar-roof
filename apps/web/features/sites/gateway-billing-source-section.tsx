"use client";

import React from 'react';
import {SiteBillingSource} from './site-billing-source';
import type {PayloadReceiveConfig} from './payload-contracts';
import {useSessionUser} from '../../providers/session-user-provider';

export function GatewayBillingSourceSection({siteId,locale,receiveConfig,onBindingSaved}:{siteId:string;locale:'en'|'th';receiveConfig:PayloadReceiveConfig;onBindingSaved?:()=>void}){
 const user=useSessionUser();
 if(user.role!=='admin')return null;
 return <section aria-label={locale==='th'?'แหล่งข้อมูลมิเตอร์ออกบิล':'Billing meter source'}>
  <SiteBillingSource siteId={siteId} locale={locale} receiveConfig={receiveConfig} {...(onBindingSaved?{onBindingSaved}:{})}/>
 </section>;
}
