/** Profilo professionista gestito dal titolare (creazione/modifica in dashboard). */
export type MyProfessionalProfile = {
  id: string;
  businessName: string;
  categorySlug: string;
  categoryLabel: string;
  city: string;
  address: string | null;
  bio: string | null;
  subTags: string[];
  verified: boolean;
  remoteAvailable: boolean;
  imageUrl: string | null;
  services: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
};

/** Lead ricevuto da un professionista in seguito a una richiesta guidata. */
export type ProfessionalLead = {
  id: string;
  status: "PENDING" | "PAID" | "CONVERTED";
  priceEurCents: number;
  createdAt: string;
  hasQuote: boolean;
  guidedRequest: {
    id: string;
    categoryLabel: string;
    description: string;
    city: string;
    isUrgent: boolean;
  };
};

/** Prenotazione lato professionista (agenda). */
export type ProfessionalBooking = {
  id: string;
  scheduledAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
  clientName: string | null;
  items: { id: string; name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null }[];
};
