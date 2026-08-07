import type { ProfessionalCategorySlug } from "./categories";

export type PlaceholderProfessional = {
  businessName: string;
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  rating: number;
  verified: boolean;
};

/**
 * Profili di esempio, usati nella home e nell'autocomplete di ricerca finché
 * la piattaforma non ha professionisti reali (CLAUDE.md §9). Da sostituire
 * con una vera ricerca su `apps/api` quando esisteranno profili reali.
 */
/** Prestazione offerta dal professionista, con range di prezzo facoltativo (in centesimi). */
export type ProfessionalServiceItem = {
  id: string;
  name: string;
  priceMinEurCents: number | null;
  priceMaxEurCents: number | null;
};

/**
 * Formatta il prezzo di una prestazione: range ("50,00 € - 90,00 €") se sono
 * impostati sia il minimo che il massimo (e sono diversi), prezzo singolo se
 * è impostato solo uno dei due, "Su richiesta" se nessuno dei due lo è.
 */
export function formatServicePriceRange(priceMinEurCents: number | null, priceMaxEurCents: number | null): string {
  const format = (cents: number) => `${(cents / 100).toFixed(2)} €`;
  if (priceMinEurCents !== null && priceMaxEurCents !== null && priceMaxEurCents > priceMinEurCents) {
    return `${format(priceMinEurCents)} - ${format(priceMaxEurCents)}`;
  }
  const single = priceMinEurCents ?? priceMaxEurCents;
  return single !== null ? format(single) : "Su richiesta";
}

/**
 * Compone in un'unica riga leggibile l'indirizzo strutturato raccolto nella
 * schermata di accettazione preventivo (street/houseNumber/addressExtra/
 * postalCode/city/province su ProfessionalBooking) — riusata sia da
 * AcceptedJobCard che da BookingDetailPanel invece di duplicare la logica
 * di composizione in entrambi i punti. Ritorna `null` se i campi
 * strutturati non sono presenti (prenotazione diretta da agenda pubblica o
 * creata prima di questa funzionalità).
 */
export function formatBookingAddress(booking: {
  street: string | null;
  houseNumber: string | null;
  addressExtra: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
}): string | null {
  if (!booking.street || !booking.houseNumber || !booking.postalCode || !booking.city || !booking.province) {
    return null;
  }
  const line1 = `${booking.street} ${booking.houseNumber}${booking.addressExtra ? `, ${booking.addressExtra}` : ""}`;
  const line2 = `${booking.postalCode} ${booking.city} (${booking.province})`;
  return `${line1} — ${line2}`;
}

/** Un orario configurato in un giorno della mini-agenda, libero o già al completo. */
export type ProfessionalAvailabilityPreviewSlot = {
  time: string;
  available: boolean;
};

/**
 * Anteprima "agenda" mostrata nella card di ricerca (richiesta esplicita
 * dell'utente, riferimento miodottore.it: colonne Oggi/Domani/... con una
 * riga per ogni orario configurato, "-" dove il professionista non ha
 * nulla, orario barrato dove la capienza è già esaurita). Ogni fascia
 * configurata dal professionista, a prescindere dalla capienza (1 o più) —
 * "devono comparire da subito gli orari disponibili a prescindere se il
 * professionista ha impostato la capienza per quella fascia 1 o più di 1".
 * Calcolata lato server in un'unica query batch per l'intera pagina di
 * risultati (mai una query per professionista, vedi ProfessionalsService.search).
 */
export type ProfessionalAvailabilityPreviewDay = {
  /** Data ISO (yyyy-mm-dd). */
  date: string;
  /** Etichetta già pronta per la UI: "Oggi", "Domani" o il giorno della settimana abbreviato. */
  label: string;
  /** Es. "7 Ago", per la seconda riga dell'intestazione colonna. */
  dateLabel: string;
  /** Ogni orario configurato quel giorno, ordinato — vuoto se il professionista non ha nulla quel giorno. */
  times: ProfessionalAvailabilityPreviewSlot[];
};

/**
 * Mostrato al posto della griglia quando i giorni in `availabilityPreview`
 * non hanno alcun orario libero (tutto "-"/al completo): il primo
 * orario libero oltre la finestra visibile, cercato più avanti nel tempo.
 * `null` se il professionista non ha alcuna disponibilità futura da
 * mostrare (nessuna fascia configurata, o tutte già esaurite per sempre).
 */
export type ProfessionalNextAvailableSlot = {
  date: string;
  dateLabel: string;
  time: string;
};

/** Risultato reale restituito da GET /professionals/search su apps/api. */
export type ProfessionalSearchResult = {
  id: string;
  businessName: string;
  categorySlug: ProfessionalCategorySlug;
  categoryLabel: string;
  city: string;
  address: string | null;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  boosted: boolean;
  remoteAvailable: boolean;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  services: ProfessionalServiceItem[];
  subTags: string[];
  /** Vuota se il professionista non ha alcuna fascia configurata nei prossimi giorni. */
  availabilityPreview: ProfessionalAvailabilityPreviewDay[];
  /** Presente solo quando availabilityPreview non ha nessun orario libero. */
  nextAvailableSlot: ProfessionalNextAvailableSlot | null;
  /**
   * Data di creazione del profilo — usata dalla vetrina "Sulla piattaforma"
   * in homepage per ordinare per più recenti e mostrare un badge "Nuovo"
   * (richiesta esplicita dell'utente, carosello in stile miodottore.it),
   * non incide sul ranking di ricerca vero e proprio (boost→rating→
   * recensioni, invariato).
   */
  createdAt: string;
};

/** Dettaglio profilo, restituito da GET /professionals/:id per la pagina pubblica. */
export type ProfessionalDetail = ProfessionalSearchResult & {
  bio: string | null;
  reviews: { id: string; rating: number; comment: string | null; photoUrls: string[]; createdAt: string }[];
  /**
   * Foto reali di lavori svolti (fino a 10), mostrate in una galleria sul
   * profilo pubblico — richiesta esplicita dell'utente: "un'idea dei lavori
   * svolti" aprendo il profilo. Solo qui (non su ProfessionalSearchResult,
   * dove appesantirebbe la risposta di ricerca senza essere mostrata nella
   * card).
   */
  portfolioUrls: string[];
};

export const PLACEHOLDER_PROFESSIONALS: PlaceholderProfessional[] = [
  { businessName: "Rossi Impianti", categorySlug: "elettricista", categoryLabel: "Elettricista", city: "Latina", rating: 4.8, verified: true },
  { businessName: "Bianchi Idraulica", categorySlug: "idraulico", categoryLabel: "Idraulico", city: "Roma", rating: 4.6, verified: true },
  { businessName: "Verdi Pulizie", categorySlug: "pulizie", categoryLabel: "Pulizie", city: "Napoli", rating: 4.9, verified: false },
  { businessName: "Colombo Ristrutturazioni", categorySlug: "muratore", categoryLabel: "Muratore e ristrutturazioni", city: "Milano", rating: 4.7, verified: true },
  { businessName: "Ferrari Elettricità", categorySlug: "elettricista", categoryLabel: "Elettricista", city: "Torino", rating: 4.5, verified: true },
  { businessName: "Romano Giardini", categorySlug: "giardiniere", categoryLabel: "Giardiniere", city: "Bologna", rating: 4.7, verified: false },
  { businessName: "Ricci Traslochi", categorySlug: "traslochi", categoryLabel: "Traslochi", city: "Firenze", rating: 4.4, verified: true },
  { businessName: "Marino Serrature", categorySlug: "fabbro", categoryLabel: "Fabbro", city: "Genova", rating: 4.6, verified: true },
  { businessName: "Greco Climatizzazione", categorySlug: "climatizzazione", categoryLabel: "Climatizzazione e caldaie", city: "Bari", rating: 4.8, verified: true },
  { businessName: "Costa Falegnameria", categorySlug: "falegname", categoryLabel: "Falegname", city: "Verona", rating: 4.9, verified: false },
];
