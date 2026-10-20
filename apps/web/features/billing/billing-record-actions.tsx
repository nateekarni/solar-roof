"use client";
import * as React from 'react';
import {useRouter} from 'next/navigation';
import {useLocale} from '../../providers/locale-provider';
import {useFinancialCapabilities} from '../../lib/financial-capabilities';
import {BillRateEditor} from './bill-rate-editor';
import {PaymentDialog} from './payment-dialog';
import {CashPaymentDialog} from './cash-payment-dialog';
import {CashPaymentHistory} from './cash-payment-history';
import {type BillingDetailData} from './billing-detail-modal';
import {getOperationActions} from '../shared/operation-actions';
import {PaymentVerificationDialog} from './payment-verification-dialog';
import {BillingRecordPanel,billingRecordTransfers} from './billing-record-panel';
import {BillingBulkApproval} from './billing-bulk-approval';
import {useSessionUser} from '../../providers/session-user-provider';
export function BillingRecordActions({row,showReview=true}:{row:Record<string,unknown>;showReview?:boolean}) {
 const locale=useLocale(),router=useRouter(),capabilities=useFinancialCapabilities();
 const user=useSessionUser();
 const [payOpen,setPayOpen]=React.useState(false),[cashOpen,setCashOpen]=React.useState(false),[reviewStarted,setReviewStarted]=React.useState(false);
 const id=typeof row.id==='string'?row.id:'';
 React.useEffect(()=>{setPayOpen(false);setCashOpen(false);setReviewStarted(false);},[id]);
 if(!id)return null;
 const text=(key:string)=>typeof row[key]==='string'?String(row[key]):undefined;
 const cycle:BillingDetailData={...row,id,status:text('status')??'',payments:billingRecordTransfers(row.payments)};
 const canVerify=cycle.status!=='paid'&&getOperationActions('billing',{...row,id},capabilities).some(action=>action.id==='verify'&&action.enabled);
 return <><BillingBulkApproval key={id} mode="single" rows={row.billingStatusView==='pending_issue_approval'?[{...row,id}]:[]} approver={{displayName:user.displayName,position:user.companyPosition,hasSignature:user.hasSignature}} locale={locale} canApprove={capabilities.operationsActions?.includes('approve_invoice')??false} onCompleted={()=>router.refresh()}/>{showReview&&(canVerify||reviewStarted)&&<PaymentVerificationDialog canReview={canVerify} inline open onOpenChange={()=>{}} billingCycle={cycle} onSuccess={()=>{setReviewStarted(true);router.refresh();}}/>}<BillRateEditor id={id} status={cycle.status} rate={row.rate} kind={row.billingKind??row.kind} payments={cycle.payments??[]} onUpdated={()=>router.refresh()}/>
  <BillingRecordPanel row={{...row,id}} capabilities={capabilities} locale={locale} onPay={()=>setPayOpen(true)} onCash={()=>setCashOpen(true)} onVerify={()=>{}} historyVisible={false} verificationVisible={false}/>
  <CashPaymentHistory entries={Array.isArray(row.cashPayments)?row.cashPayments:[]} locale={locale}/>
  <PaymentDialog open={payOpen} onOpenChange={setPayOpen} billingCycle={cycle} onSuccess={()=>router.refresh()}/>
  <CashPaymentDialog open={cashOpen} onOpenChange={setCashOpen} billingCycle={{id,outstandingAmount:text('outstandingAmount')??'0.00',invoiceNumber:text('invoiceNumber')??null,customerName:text('customerName')??null}} onSuccess={()=>router.refresh()}/>
 </>;
}
