import { authStore } from "../stores/auth-store";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  (typeof window !== "undefined"
    ? ""
    : (process.env.API_INTERNAL_URL?.trim() || "http://localhost:3001"));

let isRefreshing = false;
let refreshSubscribers: ((token: string | null) => void)[] = [];

function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      authStore.clear();
      return null;
    }

    const data = await res.json();
    if (data.user) {
      authStore.setAuth(data.user, data.accessToken);
      return data.accessToken || "refreshed";
    }
    return null;
  } catch {
    authStore.clear();
    return null;
  }
}

async function request(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  const token = authStore.getState().accessToken;

  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
  };

  let response = await fetch(url, config);

  const method = (options.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD" || response.headers.get("X-Auth-Retry-Safe") === "1";
  if (response.status === 401 && canRetry) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      onRefreshed(newToken);

      if (newToken) {
        if (newToken !== "refreshed") {
          headers.set("Authorization", `Bearer ${newToken}`);
        }
        return fetch(url, { ...config, headers });
      }
    } else {
      const retryToken = await new Promise<string | null>((resolve) => {
        refreshSubscribers.push(resolve);
      });

      if (retryToken) {
        if (retryToken !== "refreshed") {
          headers.set("Authorization", `Bearer ${retryToken}`);
        }
        return fetch(url, { ...config, headers });
      }
    }
  }

  if(response.status===403 && !endpoint.endsWith("/auth/capabilities") && typeof window!=="undefined")window.dispatchEvent(new Event("operation-permission-denied"));
  return response;
}

export const apiClient = {
  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await request(endpoint, { ...options, method: "GET" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw Object.assign(new Error(res.status===403?"สิทธิ์ของคุณเปลี่ยนแล้ว กรุณาเลือกการดำเนินการที่ยังอนุญาต":err.message || "Request failed"), {status:res.status,code:err.code});
    }
    return res.json();
  },

  async post<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const headers = new Headers(options?.headers || {});
    if (!isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await request(endpoint, {
      ...options,
      method: "POST",
      headers,
      body: isFormData ? (body as FormData) : JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(res.status===403?"สิทธิ์ของคุณเปลี่ยนแล้ว กรุณาเลือกการดำเนินการที่ยังอนุญาต":err.message || "Request failed");
    }
    return res.json();
  },

  async put<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
    const headers = new Headers(options?.headers || {});
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await request(endpoint, {
      ...options,
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(res.status===403?"สิทธิ์ของคุณเปลี่ยนแล้ว กรุณาเลือกการดำเนินการที่ยังอนุญาต":err.message || "Request failed");
    }
    return res.json();
  },

  async patch<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
    const headers = new Headers(options?.headers || {});
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await request(endpoint, {
      ...options,
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(res.status===403?"สิทธิ์ของคุณเปลี่ยนแล้ว กรุณาเลือกการดำเนินการที่ยังอนุญาต":err.message || "Request failed");
    }
    return res.json();
  },

  async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await request(endpoint, { ...options, method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(res.status===403?"สิทธิ์ของคุณเปลี่ยนแล้ว กรุณาเลือกการดำเนินการที่ยังอนุญาต":err.message || "Request failed");
    }
    return res.json();
  },

  async getBlob(endpoint: string, options?: RequestInit): Promise<Blob> {
    const res = await request(endpoint, { ...options, method: "GET" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.message || "Failed to download file"), {status:res.status,code:err.code});
    }
    return res.blob();
  },
};
