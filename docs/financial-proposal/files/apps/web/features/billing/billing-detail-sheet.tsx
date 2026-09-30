"use client";
import { BillingDetailModal, type BillingDetailData } from "./billing-detail-modal";
export interface BillingCycleDetail extends BillingDetailData {siteId?:string;schoolId?:string;cutoffTime?:string;quality?:string;invoiceId?:string;invoiceStatus?:string;paidAmount?:number}
interface Props {open:boolean;onOpenChange:(open:boolean)=>void;billingId:string|null;onUpdated?:()=>void;onOpenInvoice?:(detail:BillingCycleDetail)=>void}
// Legacy entry point shares automatic-issuance and approval behavior with the modal.
export function BillingDetailSheet(props:Props){return <BillingDetailModal {...props}/>;}
