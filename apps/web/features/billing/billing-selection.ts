export type BillingSelectionAction =
 | {type:'toggle';id:string}
 | {type:'togglePage';ids:readonly string[]}
 | {type:'reset'};

export interface BillingSelectionControls {
 selected:ReadonlySet<string>;
 toggle:(id:string)=>void;
 togglePage:(ids:readonly string[])=>void;
}

/** The caller supplies the visible page; raw lifecycle status is not eligibility. */
export function eligibleBillingRows<T extends {id:string;billingStatusView?:unknown}>(rows:readonly T[]):T[] {
 return rows.filter(row=>row.billingStatusView==='pending_issue_approval');
}

export function reduceSelection(selected:ReadonlySet<string>,action:BillingSelectionAction):Set<string> {
 if(action.type==='reset')return new Set();
 if(action.type==='togglePage'){
  return action.ids.every(id=>selected.has(id))?new Set():new Set(action.ids);
 }
 const next=new Set(selected);
 if(next.has(action.id))next.delete(action.id);else next.add(action.id);
 return next;
}
