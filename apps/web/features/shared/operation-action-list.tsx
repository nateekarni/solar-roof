'use client';
import type {OperationAction} from '@solar/api-contracts';
import {Button} from '../../components/ui/button';
import {DropdownMenuItem} from '../../components/ui/dropdown-menu';
import {useLocale} from '../../providers/locale-provider';

const englishLabels:Record<string,string>={detail:'View Billing Details',approve_issuance:'Approve and issue',pay:'Pay with Slip',verify:'Verify Payment Slip',invoice:'View Invoice',receipt:'View Receipt'};
export function OperationActionList({actions,onAction,menu=false}:{actions:OperationAction[];onAction:(id:string)=>void;menu?:boolean}) {
 const locale=useLocale();
 const visibleActions = actions.filter(action => action.enabled);
 return visibleActions.map(action=>{
  const label=locale==='en'?(englishLabels[action.id]??action.label):action.label;
  return menu ? (
    <DropdownMenuItem className="min-h-9 whitespace-normal cursor-pointer" key={action.id} onClick={()=>onAction(action.id)}>
      <span>{label}</span>
    </DropdownMenuItem>
  ) : (
    <Button className="min-h-9 h-auto whitespace-normal py-1.5 cursor-pointer" key={action.id} size="sm" variant="outline" onClick={()=>onAction(action.id)}>
      <span>{label}</span>
    </Button>
  );
 });
}
