import { storage } from "@/src/utils/storage";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BASE}/api`;

const TOKEN_KEY = "fi_session_token";

async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
    } catch {
      return null;
    }
  }
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string) {
  if (Platform.OS === "web") {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {}
    return;
  }
  await storage.secureSet(TOKEN_KEY, token);
}

export async function clearToken() {
  if (Platform.OS === "web") {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {}
    return;
  }
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) {
    if (res.status === 401) await clearToken();
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  // auth
  exchangeSession: (session_id: string) =>
    request<{ session_token: string; user: any }>("/auth/session", {
      method: "POST",
      body: JSON.stringify({ session_id }),
    }),
  me: () => request<{ user: any }>("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  // business profile
  getProfile: () => request<any>("/business-profile"),
  updateProfile: (data: any) =>
    request<any>("/business-profile", { method: "PUT", body: JSON.stringify(data) }),

  // clients
  listClients: () => request<any[]>("/clients"),
  createClient: (data: any) =>
    request<any>("/clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id: string, data: any) =>
    request<any>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteClient: (id: string) => request(`/clients/${id}`, { method: "DELETE" }),

  // invoices
  listInvoices: () => request<any[]>("/invoices"),
  getInvoice: (id: string) => request<any>(`/invoices/${id}`),
  nextNumber: () => request<{ number: string }>("/invoices/next-number"),
  createInvoice: (data: any) =>
    request<any>("/invoices", { method: "POST", body: JSON.stringify(data) }),
  updateInvoice: (id: string, data: any) =>
    request<any>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  setStatus: (id: string, status: string) =>
    request<any>(`/invoices/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteInvoice: (id: string) => request(`/invoices/${id}`, { method: "DELETE" }),
};
