import type { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";

export type ApiClientConfig = {
  baseUrl: string;
};

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

    if (!response.ok) {
      throw new Error(`Richiesta API fallita: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    health: () => request<{ status: string }>("/health"),
    getCategories: () => request<typeof PROFESSIONAL_CATEGORIES>("/categories"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
