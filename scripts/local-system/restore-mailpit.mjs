import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {assertLocalDockerTarget} from './guard.mjs';

const addresses=message=>(message.To??message.to??[]).map(value=>typeof value==='string'?value:(value.Address??value.address??'').toLowerCase());
export function missingDeliveries(documents,messages){
 return documents.filter(document=>!messages.some(message=>message.Subject===`TEST ${document.document_number}`&&addresses(message).includes(document.recipient.toLowerCase())));
}

async function main(){
 assertLocalDockerTarget('financial');
 const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
 const {Pool}=require('pg');
 const nodemailer=require('nodemailer');
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{
  const documents=(await pool.query(`SELECT d.id,d.document_number,d.document_type,d.content_hash,a.pdf_bytes,a.sha256,u.id AS recipient_id,u.email AS recipient
    FROM documents d JOIN document_artifacts a ON a.document_id=d.id JOIN billing_cycles b ON b.id=d.billing_cycle_id
    JOIN site_billing_settings cfg ON cfg.site_id=b.site_id JOIN LATERAL unnest(cfg.recipient_user_ids) recipient(user_id) ON true
    JOIN users u ON u.id=recipient.user_id AND u.status='active' AND u.role='customer_user' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email
    WHERE b.period_start>='2026-07-01' AND b.period_start<'2026-08-01' AND d.document_type IN('invoice','receipt') AND d.status IN('issued','finalized') AND d.is_current
    ORDER BY d.document_number,u.email`)).rows;
  if(!documents.length)throw Error('Issued July fixture documents are required before restoring Mailpit');
  for(const document of documents){
   const bytes=Buffer.from(document.pdf_bytes),hash=createHash('sha256').update(bytes).digest('hex');
   if(bytes.subarray(0,5).toString()!=='%PDF-'||hash!==document.sha256||hash!==document.content_hash)throw Error(`Immutable artifact integrity failed: ${document.document_number}`);
  }
  const inbox=await fetch('http://127.0.0.1:18049/api/v1/messages?limit=500');
  if(!inbox.ok)throw Error(`Mailpit API unavailable: ${inbox.status}`);
  const messages=(await inbox.json()).messages??[];
  const missing=missingDeliveries(documents,messages);
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT),secure:false,connectionTimeout:5000,socketTimeout:10000});
  try{
   for(const document of missing){
    const result=await transport.sendMail({
     from:'local-fixture@solar-platform.invalid',to:document.recipient,
     messageId:`<local-mailpit-${document.id}-${document.recipient_id}@solar-platform.invalid>`,
     subject:`TEST ${document.document_number}`,
     text:'Synthetic local inbox restoration. This message is not a production delivery event.',
     attachments:[{filename:`${document.document_number}.pdf`,content:document.pdf_bytes,contentType:'application/pdf'}],
    });
    if(!result.accepted?.map(email=>email.toLowerCase()).includes(document.recipient.toLowerCase()))throw Error(`Mailpit rejected ${document.recipient}`);
   }
  }finally{transport.close();}
  const result={documents:documents.length,restored:missing.length,preserved:documents.length-missing.length,synthetic:true};
  await mkdir('output/local-system',{recursive:true});
  await writeFile('output/local-system/mailpit-restore.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await pool.end();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
