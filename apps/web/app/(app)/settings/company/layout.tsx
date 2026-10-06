import type { ReactNode } from "react";
import { requirePageAccess } from "../../../../lib/session-user";
export default async function PageAccessLayout({children}:{children:ReactNode}) { await requirePageAccess("/settings/company"); return children; }
