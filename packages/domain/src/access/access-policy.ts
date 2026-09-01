export type PlatformRole = "owner" | "admin" | "school_user";
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
  if (actor.role === "owner") return true;
  if (resource.schoolId && actor.schoolId === resource.schoolId) {
    return actor.role === "school_user"
      ? action === "read" || action === "upload_evidence"
      : true;
  }
  if (resource.schoolId && actor.assignedSchoolIds?.includes(resource.schoolId)) {
    return actor.role === "admin";
  }
  if (resource.siteId && actor.assignedSiteIds?.includes(resource.siteId)) {
    return actor.role === "admin";
  }
  return false;
}