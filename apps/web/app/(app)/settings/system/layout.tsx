import type { ReactNode } from "react";
import { requirePageAccess } from "../../../../lib/session-user";
import { getSessionUser } from "../../../../lib/session-user";
import { effectivePageAccess } from "../../../../lib/effective-page-access";
import { redirect } from "next/navigation";
export default async function PageAccessLayout({children}:{children:ReactNode}) {
 const user=await getSessionUser();
 if(!effectivePageAccess(user,'/settings/system'))redirect('/settings');
 await requirePageAccess('/settings/system');
 return children;
}
