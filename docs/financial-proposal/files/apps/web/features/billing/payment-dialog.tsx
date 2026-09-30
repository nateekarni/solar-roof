"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiClient } from "../../lib/api-client";
interface Transfer { amount: string; paidAt: string; slipUrl: string }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; billingCycle: {id: string; amount?: number; period?: string; schoolName?: string; siteName?: string; consumedKwh?: number; rate?: number; invoiceNumber?: string} | null; onSuccess?: () => void }
const blank = (): Transfer => ({amount: "", paidAt: "", slipUrl: ""});
export function PaymentDialog({open,onOpenChange,billingCycle,onSuccess}: Props) {
 const [transfers,setTransfers] = React.useState<Transfer[]>([blank()]);
 const [note,setNote] = React.useState("");
 const [error,setError] = React.useState("");
 const [saving,setSaving] = React.useState(false);
 const [accounts,setAccounts] = React.useState<Array<{id:string;bankName:string;accountName:string;accountNumber:string}>>([]);
 React.useEffect(() => { if (!open) return; setTransfers([blank()]); setNote(""); setError(""); let cancelled=false; apiClient.get<typeof accounts>("/v1/settings/bank-accounts").then(value=>{if(!cancelled)setAccounts(value);}).catch(err=>{if(!cancelled)setError(err.message);}); return()=>{cancelled=true;}; },[open]);
 const update = (index:number,patch:Partial<Transfer>) => setTransfers(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));
 const file = async(index:number,value:File|undefined) => {
  if (!value) return;
  if(value.size>10*1024*1024||!["image/png","image/jpeg","application/pdf"].includes(value.type)){setError("Choose PNG, JPEG or PDF up to 10 MB");return;}
  const reader=new FileReader(); reader.onerror=()=>setError("Unable to read evidence file"); reader.onload=()=>update(index,{slipUrl:String(reader.result)}); reader.readAsDataURL(value);
 };
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault(); if(!billingCycle)return;
  if(transfers.some(row=>!/^\d+(\.\d{1,2})?$/.test(row.amount)||Number(row.amount)<=0||!row.paidAt||!Number.isFinite(Date.parse(row.paidAt))||!row.slipUrl)){setError("Each transfer needs its actual positive amount, date/time and evidence");return;}
  setSaving(true);setError("");try{
   await apiClient.post(`/v1/billing-cycles/${billingCycle.id}/pay`,{transfers:transfers.map(row=>({amount:Number(row.amount),paidAt:new Date(row.paidAt).toISOString(),slipUrl:row.slipUrl})),note:note.trim()||undefined});
   onSuccess?.();onOpenChange(false);
  }catch(err:any){setError(err.message||"Unable to submit payment evidence");}finally{setSaving(false);}
 };
 const total=transfers.reduce((sum,row)=>sum+Math.round(Number(row.amount||0)*100),0)/100;
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>Submit settlement evidence</DialogTitle><DialogDescription>Multiple transfers may settle one bill. Staff can approve only when their combined amount equals the full bill. Mismatches remain awaiting review.</DialogDescription></DialogHeader>
 <p>Bill: {billingCycle?.amount ?? "Unavailable"} THB · Evidence total: {total.toFixed(2)} THB</p>
 {accounts.length ? accounts.map(account=><p key={account.id}>{account.bankName} · {account.accountName} · {account.accountNumber}</p>):<p>No receiving account configured.</p>}
 <form onSubmit={submit} className="space-y-4">{transfers.map((row,index)=><fieldset key={index} className="space-y-2 border p-3"><legend>Transfer {index+1}</legend><label>Actual amount (THB)<Input aria-label={`Transfer ${index+1} amount`} type="number" step="0.01" min="0.01" value={row.amount} onChange={event=>update(index,{amount:event.target.value})}/></label><label>Actual transfer date and time (your local timezone)<Input type="datetime-local" value={row.paidAt} onChange={event=>update(index,{paidAt:event.target.value})}/></label><label>Evidence<Input type="file" accept="image/png,image/jpeg,application/pdf" onChange={event=>void file(index,event.target.files?.[0])}/></label>{row.slipUrl&&<p>Evidence attached</p>}{transfers.length>1&&<Button type="button" variant="outline" onClick={()=>setTransfers(rows=>rows.filter((_,i)=>i!==index))}>Remove transfer</Button>}</fieldset>)}
 <Button type="button" variant="outline" onClick={()=>setTransfers(rows=>[...rows,blank()])}>Add transfer</Button><label>Note<Input value={note} onChange={event=>setNote(event.target.value)}/></label>{error&&<p role="alert" className="text-destructive">{error}</p>}<Button type="submit" disabled={saving}>{saving?"Submitting…":"Submit for review"}</Button></form></DialogContent></Dialog>;
}
