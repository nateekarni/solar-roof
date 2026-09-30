import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {Pool}=createRequire(new URL('./validation/apps/api/package.json',import.meta.url))('pg');
const database=process.env.FINANCIAL_TEST_DATABASE_URL;
if(!database||new URL(database).hostname!=='127.0.0.1'||new URL(database).pathname!=='/solar_financial_v2')throw new Error('Isolated database only');
const db=new Pool({connectionString:database});
try {
 const result=await db.query(`SELECT a.pdf_bytes FROM document_artifacts a JOIN documents d ON d.id=a.document_id WHERE d.document_number LIKE 'TEST-%' ORDER BY a.created_at DESC LIMIT 1`);
 if(!result.rows[0])throw new Error('Run PDF integration fixture first');
 await mkdir(new URL('./artifacts/',import.meta.url),{recursive:true});
 await writeFile(new URL('./artifacts/test-invoice.pdf',import.meta.url),result.rows[0].pdf_bytes);
 console.log('Exported isolated fixture PDF');
}finally{await db.end();}
