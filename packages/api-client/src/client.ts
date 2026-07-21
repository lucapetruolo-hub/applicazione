import type {
  PROFESSIONAL_CATEGORIES,
  ChangePasswordInput,
  GuidedRequestInput,
  MyProfessionalProfile,
  ProfessionalBooking,
  ProfessionalDetail,
  ProfessionalLead,
  ProfessionalProfileSelfInput,
  ProfessionalSearchResult,
  QuoteSelfInput,
  ReviewInput,
  UpdateAccountInput,
} from "@professionisti/shared";

export type ClientBooking = {
  id: string;
  scheduledAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  businessName: string;
  professionalProfileId: string;
  hasReview: boolean;
};

export type ClientGuidedRequest = {
  id: string;
  categorySlug: string;
  categoryLabel: string;
  description: string;
  city: string;
  isUrgent: boolean;
  status: "OPEN" | "MATCHED" | "CLOSED";
  createdAt: string;
  quotes: {
    id: string;
    professionalProfileId: string;
    businessName: string;
    laborEurCents: number;
    materialsEurCents: number;
    estimatedStartDate: string;
    notes: string | null;
    status: "SENT" | "ACCEPTED" | "REJECTED";
  }[];
};

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

    register: (email: string, password: string, name?: string, role?: "CLIENT" | "PROFESSIONAL") =>
      request<AuthResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name, role }),
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

    updateAccount: (token: string, input: UpdateAccountInput) =>
      request<CurrentUser>("/auth/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    changePassword: (token: string, input: ChangePasswordInput) =>
      request<{ success: boolean }>("/auth/change-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    saveProfessional: (token: string, professionalProfileId: string) =>
      request<{ saved: boolean }>(`/saved-professionals/${professionalProfileId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    unsaveProfessional: (token: string, professionalProfileId: string) =>
      request<{ saved: boolean }>(`/saved-professionals/${professionalProfileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),

    mySavedProfessionals: (token: string) =>
      request<ProfessionalSearchResult[]>("/saved-professionals/me", { headers: { Authorization: `Bearer ${token}` } }),

    searchProfessionals: (params: { category?: string; city?: string; q?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.category) query.set("category", params.category);
      if (params.city) query.set("city", params.city);
      if (params.q) query.set("q", params.q);
      const queryString = query.toString();
      return request<ProfessionalSearchResult[]>(`/professionals/search${queryString ? `?${queryString}` : ""}`);
    },

    getProfessional: (id: string) => request<ProfessionalDetail>(`/professionals/${id}`),

    createGuidedRequest: (token: string, input: GuidedRequestInput) =>
      request<{ guidedRequestId: string; matchedProfessionals: number }>("/guided-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    myGuidedRequests: (token: string) =>
      request<ClientGuidedRequest[]>("/guided-requests/me", { headers: { Authorization: `Bearer ${token}` } }),

    getMyProfessionalProfile: (token: string) =>
      request<MyProfessionalProfile | null>("/professionals/me", { headers: { Authorization: `Bearer ${token}` } }),

    upsertMyProfessionalProfile: (token: string, input: ProfessionalProfileSelfInput) =>
      request<MyProfessionalProfile>("/professionals/me", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    myLeads: (token: string) =>
      request<ProfessionalLead[]>("/professionals/me/leads", { headers: { Authorization: `Bearer ${token}` } }),

    myProfessionalBookings: (token: string) =>
      request<ProfessionalBooking[]>("/professionals/me/bookings", { headers: { Authorization: `Bearer ${token}` } }),

    createQuote: (token: string, input: QuoteSelfInput) =>
      request<{ id: string; status: string }>("/quotes", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    acceptQuote: (token: string, quoteId: string) =>
      request<{ bookingId: string }>(`/bookings/from-quote/${quoteId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    updateBookingStatus: (token: string, bookingId: string, status: "COMPLETED" | "CANCELED" | "NO_SHOW") =>
      request<{ bookingId: string; status: string }>(`/bookings/${bookingId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      }),

    myClientBookings: (token: string) =>
      request<ClientBooking[]>("/bookings/me", { headers: { Authorization: `Bearer ${token}` } }),

    createReview: (token: string, input: ReviewInput) =>
      request<{ id: string }>("/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      }),

    createSubscriptionCheckout: (token: string, plan: "PRO" | "BUSINESS") =>
      request<{ url: string | null }>("/billing/subscription/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      }),

    createLeadCheckout: (token: string, leadId: string) =>
      request<{ url: string | null }>(`/billing/leads/${leadId}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),

    createBoostCheckout: (token: string, type: "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO") =>
      request<{ url: string | null }>("/billing/boost/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
