import {z} from 'zod';

const schema = z.object({
 DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),
 BOOTSTRAP_ADMIN_EMAIL:z.string().trim().toLowerCase().email(),
 BOOTSTRAP_ADMIN_PASSWORD:z.string().min(16),
 STORAGE_ENDPOINT:z.string().url(), STORAGE_REGION:z.string().trim().min(1),
 STORAGE_BUCKET:z.string().trim().min(1), STORAGE_ACCESS_KEY:z.string().min(1), STORAGE_SECRET_KEY:z.string().min(1),
});
export function parseBootstrapConfig(input: Record<string,string|undefined>) {
 const result=schema.safeParse(input);
 if(!result.success) throw new Error(`Invalid bootstrap fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 const value=result.data;
 return {email:value.BOOTSTRAP_ADMIN_EMAIL,password:value.BOOTSTRAP_ADMIN_PASSWORD,databaseUrl:value.DATABASE_URL,storageEndpoint:value.STORAGE_ENDPOINT,storageRegion:value.STORAGE_REGION,storageBucket:value.STORAGE_BUCKET,storageAccessKey:value.STORAGE_ACCESS_KEY,storageSecretKey:value.STORAGE_SECRET_KEY};
}
