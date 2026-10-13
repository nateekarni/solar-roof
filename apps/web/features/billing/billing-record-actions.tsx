"use client";
import * as React from 'react';
import {useRouter} from 'next/navigation';
import {useLocale} from '../../providers/locale-provider';
import {useFinancialCapabilities} from '../../lib/financial-capabilities';
import {BillRateEditor} from './bill-rate-editor';
import {PaymentDialog} from './payment-dialog';
import {type BillingDetailData} from './billing-detail-modal';
import {getOperationActions} from '../shared/operation-actions';
import {PaymentVerificationDialog} from './payment-verification-dialog';
import {BillingRecordPanel,billingRecordTransfers} from './billing-record-panel';
export function BillingRecordActions({row,showReview=true}:{row:Record<string,unknown>;showReview?:boolean}) {
 const locale=useLocale(),router=useRouter(),capabilities=useFinancialCapabilities();
 const [payOpen,setPayOpen]=React.useState(false),[reviewStarted,setReviewStarted]=React.useState(false);
 const id=typeof row.id==='string'?row.id:'';
 React.useEffect(()=>{setPayOpen(false);setReviewStarted(false);},[id]);
 if(!id)return null;
 const text=(key:string)=>typeof row[key]==='string'?String(row[key]):undefined;
 const cycle:BillingDetailData={...row,id,status:text('status')??'',payments:billingRecordTransfers(row.payments)};
 const canVerify=cycle.status!=='paid'&&getOperationActions('billing',{...row,id},capabilities).some(action=>action.id==='verify'&&action.enabled);
 return <>{showReview&&(canVerify||reviewStarted)&&<PaymentVerificationDialog canReview={canVerify} inline open onOpenChange={()=>{}} billingCycle={cycle} onSuccess={()=>{setReviewStarted(true);router.refresh();}}/>}<BillRateEditor id={id} status={cycle.status} rate={row.rate} kind={row.billingKind??row.kind} payments={cycle.payments??[]} onUpdated={()=>router.refresh()}/>
  <BillingRecordPanel row={{...row,id}} capabilities={capabilities} locale={locale} onPay={()=>setPayOpen(true)} onVerify={()=>{}} historyVisible={false} verificationVisible={false}/>
  <PaymentDialog open={payOpen} onOpenChange={setPayOpen} billingCycle={cycle} onSuccess={()=>router.refresh()}/>
 </>;
}
