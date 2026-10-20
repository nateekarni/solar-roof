import type { ReactNode } from "react";
import { requirePageAccess } from "../../../../lib/session-user";
import { redirect } from "next/navigation";
export default async function PageAccessLayout({children}:{children:ReactNode}) {
  const user = await requirePageAccess("/settings/account");
  if (user.role === "customer_user") redirect("/settings");
  return children;
}
