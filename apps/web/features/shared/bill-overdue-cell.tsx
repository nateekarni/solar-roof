import type {OperationRow} from '@solar/api-contracts';
export function BillOverdueCell({row,locale}:{row:OperationRow;locale:string}) {
 const days=Number(row.daysOverdue),reminders=Number(row.successfulReminderCount);
 if(row.collectionStatus!=='overdue'||!Number.isInteger(days)||days<1||!Number.isInteger(reminders)||reminders<0)return <span>—</span>;
 return <span>{locale==='th'?`${days} วัน (ทวงแล้ว ${reminders} ครั้ง)`:`${days} days (${reminders} reminders sent)`}</span>;
}
