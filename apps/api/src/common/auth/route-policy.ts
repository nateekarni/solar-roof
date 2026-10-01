export interface ScopePrincipal {
  id?: string;
  role?: string;
  schoolId?: string | undefined;
}

export function schoolScope(user: ScopePrincipal | undefined): string[] | null {
  if (!user || !["owner", "admin", "operator", "accountant", "school_user"].includes(user.role ?? "")) return [];
  if (user.role === "owner") return null;
  if (user.schoolId) return [user.schoolId];
  return user.role === "school_user" ? [] : null;
}

/** Action policy is server-owned; request headers cannot select privileges. */
export function routeAllowed(role: string, method: string, rawPath: string): boolean {
  if (!["owner", "admin", "operator", "accountant", "school_user"].includes(role)) return false;
  const path = rawPath.split("?")[0]!.replace(/\/$/, "");
  const read = method === "GET" || method === "HEAD";
  if (/^\/v1\/(?:auth\/(?:me|capabilities)|me(?:\/preferences)?|notifications\/settings)$/.test(path)) return true;
  if (/^\/v1\/operations\/(?:users|audit)(?:\/|$)/.test(path)) return read && ["owner", "admin"].includes(role);
  if (/^\/v1\/(?:sites|schools|gateways|devices|meter-presets)(?:\/|$)/.test(path)) return read || role === "admin";
  if (path === "/v1/telemetry/ingest") return false; // MQTT is the only provisioned ingestion transport.
  if (/^\/v1\/billing-cycles\/[^/]+\/pay$/.test(path)) return method === "POST" && ["owner", "admin", "accountant", "school_user"].includes(role);
  if (path === '/v1/contracts' && !read) return method === 'POST' && ['owner','admin'].includes(role);
  if (/^\/v1\/billing-cycles\/[^/]+\/(?:generate-invoice|verify-payment|status|adjust|send-email)$/.test(path) || path === '/v1/documents' && !read) return ['owner','accountant'].includes(role);
  if (/^\/v1\/(?:billing-cycles|contracts|documents)(?:\/|$)/.test(path)) return read || ["owner", "admin", "accountant"].includes(role);
  if (/^\/v1\/settings(?:\/|$)/.test(path)) {
    if (read) return role !== "school_user" || /\/settings\/(?:company|bank-accounts)$/.test(path);
    return ["owner", "admin"].includes(role);
  }
  if (/^\/v1\/users(?:\/|$)/.test(path)) return ["owner", "admin"].includes(role);
  if (/^\/v1\/alerts(?:\/|$)/.test(path)) return read || ["owner", "admin", "operator"].includes(role);
  if (/^\/v1\/reports(?:\/|$)/.test(path)) return read || method === "POST";
  if (/^\/v1\/jobs(?:\/|$)/.test(path)) return read || method === 'POST' && /^\/v1\/jobs\/[^/]+\/(cancel|retry)$/.test(path);
  return read && /^\/v1\/(?:dashboard|operations)(?:\/|$)/.test(path);
}
