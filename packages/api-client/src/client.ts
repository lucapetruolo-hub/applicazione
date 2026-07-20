import type { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";

export type ApiClientConfig = {
  baseUrl: string;
};

export type AuthResult = { token: string; isNewUser: boolean };

export type CurrentUser = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  role: "CLIENT" | "PROFESSIONAL" | "ADMIN";
};

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (record.fieldErrors && typeof record.fieldErrors === "object") {
      const firstError = Object.values(record.fieldErrors as Record<string, string[]>).flat()[0];
      if (firstError) return firstError;
    }
  }
  return fallback;
}

/**
 * Client tipizzato unico per chiamare apps/api da apps/web e apps/mobile —
 * niente logica di business duplicata nei due frontend (CLAUDE.md §3).
 */
export function createApiClient({ baseUrl }: ApiClientConfig) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractErrorMessage(body, `Richiesta API fallita: ${response.status} ${response.statusText}`));
    }

    return body as T;
  }

  return {
    health: () => request<{ status: string }>("/health"),
    getCategories: () => request<typeof PROFESSIONAL_CATEGORIES>("/categories"),

    register: (email: string, password: string, name?: string) =>
      request<AuthResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      }),

    login: (email: string, password: string) =>
      request<AuthResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    verifyGoogle: (idToken: string) =>
      request<AuthResult>("/auth/google/verify", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      }),

    me: (token: string) => request<CurrentUser | null>("/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
