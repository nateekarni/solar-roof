import {OperationPage} from '../../../features/shared/operation-page';
import {OrganizationDocuments} from '../../../features/organization/organization-documents';
import {requirePageAccess} from '../../../lib/session-user';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await requirePageAccess('/contracts');
 return user.role==='school_user'?<OrganizationDocuments/>:<OperationPage resource="contracts"/>;
}
