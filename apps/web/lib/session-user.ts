import { authenticatedPageUser, PageAccessDenied } from "./page-access";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { canVisitPage } from "@solar/domain";
import type { AuthUser } from "../stores/auth-store";
import { getApiBaseUrl, serverFetch } from "./server-fetch";
export const getSessionUser = cache(async (): Promise<AuthUser> => {
 const response = await serverFetch(getApiBaseUrl()+"/v1/auth/me", { cache: "no-store" });
 if (response.status === 403) redirect("/login");
 if (!response.ok) throw new Error("Unable to verify session");
 const user: AuthUser = await response.json();
 if (!user.id || !canVisitPage(user.role, "/")) redirect("/login");
 return user;
});
export async function requirePageAccess(path: string): Promise<AuthUser> {
 try { return await authenticatedPageUser(path,getSessionUser); }
 catch(error) { if(error instanceof PageAccessDenied) notFound(); throw error; }
}
