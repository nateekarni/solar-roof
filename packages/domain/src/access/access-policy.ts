export type PlatformRole = "owner" | "admin" | "operator" | "accountant" | "customer_user";
export type AccessAction = "read" | "manage" | "finalize" | "mark_paid" | "upload_evidence";

export interface AccessActor {
  id: string;
  role: PlatformRole;
  customerId?: string;
  assignedCustomerIds?: readonly string[];
  assignedSiteIds?: readonly string[];
}

export interface AccessResource {
  customerId?: string;
  siteId?: string;
}

export function canAccess(actor: AccessActor, action: AccessAction, resource: AccessResource): boolean {
  if (!["owner", "admin", "operator", "accountant", "customer_user"].includes(actor.role)) return false;
  if (actor.role === "owner" || actor.role === "admin") return true;
  if (actor.role === 'customer_user' && (!resource.siteId || actor.assignedSiteIds?.length !== 1 || actor.assignedSiteIds[0] !== resource.siteId)) return false;
  if (resource.customerId && actor.customerId === resource.customerId) {
    return actor.role === "customer_user"
      ? action === "read" || action === "upload_evidence"
      : true;
  }
  return false;
}
