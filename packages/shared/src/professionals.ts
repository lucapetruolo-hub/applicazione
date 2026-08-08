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

/** Formatta un importo in centesimi come "12,50 €" — stesso pattern già usato in `formatServicePriceRange`. */
export function formatEurCents(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

/**
 * Somma minimi e massimi delle voci di un preventivo — richiesta esplicita
 * dell'utente: "alla fine delle varie voci... inserisci 'prezzo' con il
 * totale dei minimi in un riquadro e il totale dei massimi nell'altro". Una
 * voce "Su richiesta" (né minimo né massimo indicato) non contribuisce a
 * nessuno dei due totali: non è una spesa a 0€, è un prezzo non ancora
 * indicato. Una voce con un solo estremo indicato conta quel valore su
 * entrambi i totali (lo stesso principio già seguito da
 * `formatServicePriceRange` per un prezzo singolo).
 */
export function quotePriceTotals(
  items: { priceMinEurCents: number | null; priceMaxEurCents: number | null }[],
): { totalMinEurCents: number; totalMaxEurCents: number } {
  let totalMinEurCents = 0;
  let totalMaxEurCents = 0;
  for (const item of items) {
    totalMinEurCents += item.priceMinEurCents ?? item.priceMaxEurCents ?? 0;
    totalMaxEurCents += item.priceMaxEurCents ?? item.priceMinEurCents ?? 0;
  }
  return { totalMinEurCents, totalMaxEurCents };
}

/**
 * Prezzo totale medio tra più preventivi ricevuti per la stessa richiesta
 * guidata — richiesta esplicita dell'utente, solo per una richiesta
 * "generica" (non diretta a un singolo professionista) con almeno 1
 * risposta. Media del punto medio (min+max)/2 di ciascun preventivo; un
 * preventivo senza alcun prezzo indicato (tutte le voci "Su richiesta") non
 * entra nella media — `null` se nessun preventivo ha un prezzo indicato.
 */
export function averageQuoteTotalEurCents(
  quotesItems: { priceMinEurCents: number | null; priceMaxEurCents: number | null }[][],
): number | null {
  const midpoints = quotesItems
    .map((items) => quotePriceTotals(items))
    .filter((totals) => totals.totalMinEurCents > 0 || totals.totalMaxEurCents > 0)
    .map((totals) => (totals.totalMinEurCents + totals.totalMaxEurCents) / 2);
  if (midpoints.length === 0) return null;
  return Math.round(midpoints.reduce((sum, value) => sum + value, 0) / midpoints.length);
}

/**
 * Costruisce un link `wa.me` da un numero di telefono già raccolto
 * (nessuna API WhatsApp Business, nessuna nuova integrazione — richiesta
 * esplicita dell'utente di poter chiamare su WhatsApp riusando lo stesso
 * numero già mostrato come link `tel:`). `wa.me` richiede solo cifre più
 * prefisso internazionale, senza `+`/spazi/trattini: un numero italiano
 * salvato come "+39 333 1234567" o "333 1234567" diventa entrambi
 * "393331234567" — se il numero non ha già un prefisso internazionale
 * (non inizia con "00"/"+"), si assume "39" (Italia, unico mercato di
 * lancio, CLAUDE.md §7). Ritorna `null` se il numero, ripulito, è vuoto.
 */
export function buildWhatsAppLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const hasExplicitCountryCode = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "").replace(/^0+/, hasExplicitCountryCode ? "" : "");
  if (!digits) return null;
  const withCountryCode = hasExplicitCountryCode || digits.startsWith("39") ? digits : `39${digits}`;
  return `https://wa.me/${withCountryCode}`;
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

/**
 * Un orario configurato in un giorno della mini-agenda, con disponibilità
 * indipendente per modalità (richiesta esplicita dell'utente: tab "A
 * domicilio"/"Online" sopra "Prossima disponibilità", ognuna mostra solo
 * gli orari con quella modalità offerta e la relativa capienza residua).
 * `allowsHome`/`allowsOnline` = il professionista offre quel tipo su
 * questa fascia; `homeAvailable`/`onlineAvailable` = offerto E con
 * capienza ancora residua per quel tipo (sempre `false` se il tipo non è
 * offerto). La UI filtra/mostra in base al tab attivo.
 */
export type ProfessionalAvailabilityPreviewSlot = {
  time: string;
  /** Fine della fascia (es. "10:00"): mostrata insieme a `time` come intervallo completo, non solo l'inizio. */
  endTime: string;
  allowsHome: boolean;
  allowsOnline: boolean;
  homeAvailable: boolean;
  onlineAvailable: boolean;
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
 * 14 giorni totali (stesso orizzonte di `getPublicAgenda`), non solo i 4
 * mostrati di default: la UI pagina in finestre da 4 colonne con frecce
 * avanti/indietro, richiesta esplicita dell'utente ("dare la possibilità
 * di navigare anche ai giorni successivi") — nessuna richiesta di rete
 * aggiuntiva per scorrere in avanti.
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
  /** Lingue parlate (richiesta esplicita dell'utente, filtro "Lingua parlata" nel pannello filtri di ricerca) — sempre almeno una in pratica ("Italiano" precompilato), ma tecnicamente può essere vuota se il professionista le rimuove tutte. */
  spokenLanguages: string[];
  /** Vuota se il professionista non ha alcuna fascia configurata nei prossimi giorni. */
  availabilityPreview: ProfessionalAvailabilityPreviewDay[];
  /**
   * Presenti solo quando availabilityPreview non ha nessun orario libero
   * per quella specifica modalità — due campi distinti (non uno solo)
   * perché "prossimo libero" dipende dal tab attivo (A domicilio/Online):
   * un professionista può avere il prossimo orario libero a domicilio
   * oggi ma online solo tra una settimana.
   */
  nextAvailableSlotHome: ProfessionalNextAvailableSlot | null;
  nextAvailableSlotOnline: ProfessionalNextAvailableSlot | null;
  /**
   * Data di creazione del profilo — usata dalla vetrina "Sulla piattaforma"
   * in homepage per ordinare per più recenti e mostrare un badge "Nuovo"
   * (richiesta esplicita dell'utente, carosello in stile miodottore.it),
   * non incide sul ranking di ricerca vero e proprio (boost→rating→
   * recensioni, invariato).
   */
  createdAt: string;
  /**
   * "Ha completato N interventi questo mese" (richiesta esplicita
   * dell'utente): conteggio reale di `Booking` con stato `COMPLETED`
   * aggiornate nel mese di calendario corrente — mostrato sia sulla card
   * di ricerca sia sul profilo pubblico (`ProfessionalDetail` eredita
   * questo campo).
   */
  completedThisMonth: number;
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
