import type { ReactNode } from "react";
import { requirePageAccess } from "../../../lib/session-user";
export default async function PageAccessLayout({children}:{children:ReactNode}) { await requirePageAccess("/contracts"); return children; }
