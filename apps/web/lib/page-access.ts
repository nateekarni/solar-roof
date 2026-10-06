import { canVisitPage } from '@solar/domain';
export class PageAccessDenied extends Error { constructor() { super('Page access denied'); } }
/** Load authoritative identity before evaluating a requested page, including direct URLs. */
export async function authenticatedPageUser<T extends {role:string}>(path:string,loadUser:()=>Promise<T>):Promise<T> {
  const user = await loadUser();
  if (!canVisitPage(user.role,path)) throw new PageAccessDenied();
  return user;
}
