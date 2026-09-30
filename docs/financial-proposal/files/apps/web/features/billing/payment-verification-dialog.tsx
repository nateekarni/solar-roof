"use client";
import { BillingDetailModal } from "./billing-detail-modal";
interface Props {open:boolean;onOpenChange:(open:boolean)=>void;billingCycle:{id:string;period?:string;schoolName?:string;siteName?:string;amount?:number;consumedKwh?:number;slipUrl?:string;paidAt?:string;paymentNote?:string;paymentStatus?:string;status?:string}|null;onSuccess?:()=>void}
// Fetch current transfers and use the same financial-role checks as the detail view.
export function PaymentVerificationDialog({open,onOpenChange,billingCycle,onSuccess}:Props){return <BillingDetailModal open={open} onOpenChange={onOpenChange} billingId={billingCycle?.id??null} {...(onSuccess ? {onUpdated:onSuccess} : {})}/>;}
