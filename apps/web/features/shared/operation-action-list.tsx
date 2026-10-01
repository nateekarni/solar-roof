'use client';
import type {OperationAction} from '@solar/api-contracts';
import {Button} from '../../components/ui/button';
import {DropdownMenuItem} from '../../components/ui/dropdown-menu';
import {useLocale} from '../../providers/locale-provider';

const englishLabels:Record<string,string>={detail:'View Billing Details',pay:'Pay with Slip',verify:'Verify Payment Slip',invoice:'View Invoice',receipt:'View Receipt'};
export function OperationActionList({actions,onAction,menu=false}:{actions:OperationAction[];onAction:(id:string)=>void;menu?:boolean}) {
 const locale=useLocale();
 return actions.map(action=>{
  const label=locale==='en'?(englishLabels[action.id]??action.label):action.label;
  const reason=action.reason&&locale==='en'?'No issued document is available for this record.':action.reason;
  const content=<><span>{label}</span>{reason&&<span className="text-xs"> · {reason}</span>}</>;
  return menu?<DropdownMenuItem key={action.id} disabled={!action.enabled} title={reason} onClick={()=>onAction(action.id)}>{content}</DropdownMenuItem>:<Button key={action.id} size="sm" variant="outline" disabled={!action.enabled} title={reason} onClick={()=>onAction(action.id)}>{content}</Button>;
 });
}
