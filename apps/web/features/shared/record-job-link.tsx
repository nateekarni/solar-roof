import Link from 'next/link';
import {Button} from '../../components/ui/button';

export function RecordJobLink({resource,jobId,locale}:{resource:string;jobId:unknown;locale:string}) {
 if(!['notifications','reports'].includes(resource)||typeof jobId!=='string'||!jobId)return null;
 return <Button asChild variant="outline"><Link href={`/reports?job=${encodeURIComponent(jobId)}`}>{locale==='th'?'เปิดงาน':'Open job'}</Link></Button>;
}
