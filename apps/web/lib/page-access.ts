import {effectivePageAccess,type AuthorizationSnapshot} from './effective-page-access';
export class PageAccessDenied extends Error { constructor() { super('Page access denied'); } }
/** Load authoritative identity before evaluating a requested page, including direct URLs. */
export async function authenticatedPageUser<T extends {role:string;authorization?:AuthorizationSnapshot}>(path:string,loadUser:()=>Promise<T>):Promise<T> {
  const user = await loadUser();
  if (!effectivePageAccess(user,path)) throw new PageAccessDenied();
  return user;
}
