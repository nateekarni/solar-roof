type ReminderInput={dueDate:string;startDays:number|null;intervalDays:number|null;enabled:boolean;status:string;pendingEvidence:boolean;outstanding?:number};

export function reminderSlot(input:ReminderInput,today:string):number|null {
 if(!input.enabled||input.pendingEvidence||(input.outstanding??1)<=0||['paid','cancelled','draft','superseded'].includes(input.status)||input.startDays===null||input.intervalDays===null||!Number.isInteger(input.startDays)||input.startDays<0||!Number.isInteger(input.intervalDays)||input.intervalDays<1)return null;
 const elapsed=Math.floor((Date.parse(today)-Date.parse(input.dueDate))/86400000)-input.startDays;
 return Number.isFinite(elapsed)&&elapsed>=0?Math.floor(elapsed/input.intervalDays):null;
}

export function isPaymentPreReminderDay(input:ReminderInput,today:string):boolean {
 if(!input.enabled||input.pendingEvidence||(input.outstanding??0)<=0||['paid','cancelled','draft','superseded'].includes(input.status)||input.startDays===null||!Number.isInteger(input.startDays)||input.startDays<0)return false;
 const firstCustomerReminder=Date.parse(input.dueDate)+input.startDays*86400000;
 return Number.isFinite(firstCustomerReminder)&&Date.parse(today)===firstCustomerReminder-86400000;
}
export interface AlertState {since?:number|null;active?:boolean;lastAlarm?:number|null;}
export function transitionAlert(rule:{durationSeconds:number;cooldownSeconds:number;recovery:boolean},previous:AlertState,condition:boolean|null,now:number):{state:AlertState;event:'alarm'|'recovery'|null} {
 const state={...previous};if(condition===null){if(!state.active)state.since=null;return {state,event:null};}
 if(!condition){const event=state.active&&rule.recovery?'recovery':null;state.since=null;state.active=false;return {state,event};}
 state.since??=now;
 if(!state.active&&now-state.since>=rule.durationSeconds*1000&&(state.lastAlarm==null||now-state.lastAlarm>=rule.cooldownSeconds*1000)){state.active=true;state.lastAlarm=now;return {state,event:'alarm'};}
 return {state,event:null};
}
