import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
export interface Payment { id:string;invoiceId?:string;billingCycleId?:string;amount:number;status:"pending"|"paid"|"rejected";paidAt?:Date;markedBy?:string;evidenceFileId?:string;note?:string; }
@Injectable()
export class PaymentService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}
 async create(_input:Omit<Payment,"status">):Promise<Payment> { throw new ConflictException("Submit payment evidence through the billing-cycle payment endpoint"); }
 async markPaid(_input:{paymentId:string;actorId:string;evidenceFileId?:string}):Promise<Payment> { throw new ConflictException("Verify payment through the transactional billing-cycle verification endpoint"); }
 async get(id:string):Promise<Payment> {
  const row=(await this.db.query(`SELECT id,billing_cycle_id AS "billingCycleId",amount,status,paid_at AS "paidAt",evidence_key AS "evidenceFileId" FROM payments WHERE id=$1`,[id])).rows[0];
  if(!row) throw new NotFoundException("Payment not found");
  return {id:row.id,billingCycleId:row.billingCycleId,amount:Number(row.amount),status:row.status,paidAt:row.paidAt,evidenceFileId:row.evidenceFileId};
 }
}
