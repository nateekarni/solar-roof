import {z} from 'zod';
export function organizationFormSchema(locale:'th'|'en'){
 return z.object({name:z.string().min(2,locale==='th'?'ชื่อองค์กรต้องมีอย่างน้อย 2 ตัวอักษร':'Organization name must contain at least 2 characters.'),region:z.string().min(1,locale==='th'?'กรุณาเลือกภูมิภาค':'Select a region.')});
}
