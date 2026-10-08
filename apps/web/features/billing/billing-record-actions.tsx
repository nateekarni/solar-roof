"use client";
import * as React from 'react';
import {useRouter} from 'next/navigation';
import {useLocale} from '../../providers/locale-provider';
import {useFinancialCapabilities} from '../../lib/financial-capabilities';
import {PaymentDialog} from './payment-dialog';
import {BillingDetailModal,type BillingDetailData} from './billing-detail-modal';
import {BillingRecordPanel,billingRecordTransfers} from './billing-record-panel';
export function BillingRecordActions({row}:{row:Record<string,unknown>}) {
 const locale=useLocale(),router=useRouter(),capabilities=useFinancialCapabilities();
 const [payOpen,setPayOpen]=React.useState(false),[verifyOpen,setVerifyOpen]=React.useState(false);
 const id=typeof row.id==='string'?row.id:'';
 React.useEffect(()=>{setPayOpen(false);setVerifyOpen(false);},[id]);
 if(!id)return null;
 const text=(key:string)=>typeof row[key]==='string'?String(row[key]):undefined;
 const cycle:BillingDetailData={...row,id,status:text('status')??'',payments:billingRecordTransfers(row.payments)};
 return <>
  <BillingRecordPanel row={{...row,id}} capabilities={capabilities} locale={locale} onPay={()=>setPayOpen(true)} onVerify={()=>setVerifyOpen(true)} historyVisible={!verifyOpen}/>
  <PaymentDialog open={payOpen} onOpenChange={setPayOpen} billingCycle={cycle} onSuccess={()=>router.refresh()}/>
  <BillingDetailModal open={verifyOpen} onOpenChange={setVerifyOpen} billingId={id} initialData={cycle} onUpdated={()=>router.refresh()}/>
 </>;
}