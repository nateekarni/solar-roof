import type {manualBillInput} from './finance-workspace-input';
type ManualInput=ReturnType<typeof manualBillInput>;
/** One user issuance intent; failed transport/delivery responses retain its identity for retry. */
export class ManualBillOperation {
 private pending:(ManualInput&{idempotencyKey:string})|null=null;
 reset(){this.pending=null;}
 async issue<T>(input:ManualInput,post:(payload:ManualInput&{idempotencyKey:string})=>Promise<T>):Promise<T>{
  this.pending??={...structuredClone(input),idempotencyKey:crypto.randomUUID()};
  const result=await post(this.pending);
  this.reset();return result;
 }
}
