import "reflect-metadata";
import {config} from "dotenv";
import {DatabaseService} from "../database/database.service.js";
import {OperationsService} from "../modules/dashboard/operations.service.js";
import {operationQueries} from "../modules/dashboard/operation-query.js";
config({path:"../../.env",quiet:true});
const db=new DatabaseService();
try {
 const service=new OperationsService(db);
 const users=await db.query<{id:string}>("SELECT id FROM users WHERE role='admin' LIMIT 1");
 const id=users.rows[0]?.id;
 if(!id)throw new Error('Create a local administrator before running UI verification');
 const principal={id,role:'admin'};
 let checked=0;
 for(const [resource,policy] of Object.entries(operationQueries)) {
  for(const sort of policy.sorts) for(const direction of ['asc','desc']) {await service.list(resource,principal,{sort,direction,limit:'1'});checked++;}
 }
 if(principal.id)await service.detail('users',principal.id,principal);
 console.log(`Verified ${checked} server sort queries and saved user detail against local PostgreSQL.`);
} finally {await db.onModuleDestroy();}
