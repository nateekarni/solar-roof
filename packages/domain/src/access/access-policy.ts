export type PlatformRole = "owner" | "admin" | "operator" | "accountant" | "school_user";
export type AccessAction = "read" | "manage" | "finalize" | "mark_paid" | "upload_evidence";

export interface AccessActor {
  id: string;
  role: PlatformRole;
  schoolId?: string;
  assignedSchoolIds?: readonly string[];
  assignedSiteIds?: readonly string[];
}

export interface AccessResource {
  schoolId?: string;
  siteId?: string;
}

export function canAccess(actor: AccessActor, action: AccessAction, resource: AccessResource): boolean {
  if (!["owner", "admin", "operator", "accountant", "school_user"].includes(actor.role)) return false;
  if (actor.role === "owner" || actor.role === "admin") return true;
  if (resource.schoolId && actor.schoolId === resource.schoolId) {
    return actor.role === "school_user"
      ? action === "read" || action === "upload_evidence"
      : true;
  }
  return false;
}
