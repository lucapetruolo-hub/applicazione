import type { PdfBlock, PdfDocumentModel, PdfRow } from "../accounting/document-pdf";

/**
 * "Scarica i tuoi dati" in PDF leggibile (controllo pre-lancio 08/11/2026,
 * E4-09; GDPR art. 12 c. 1 e art. 15 c. 3): lo stesso contenuto del file
 * JSON di `exportMyData`, con titoli e nomi dei campi in italiano, date e
 * importi scritti per esteso. I campi tecnici (codici interni, impronte)
 * restano nel file JSON, che serve per la portabilità (art. 20).
 */

const SECTION_TITLES: Record<string, string> = {
  account: "Il tuo account",
  guidedRequests: "Le tue richieste di preventivo",
  bookingsAsClient: "I tuoi lavori come cliente",
  reviewsWritten: "Le recensioni che hai scritto",
  savedProfessionals: "Professionisti salvati",
  profile: "Il tuo profilo professionista",
  services: "Le tue prestazioni",
  availabilitySlots: "I tuoi orari",
  leads: "Richieste ricevute",
  quotesSent: "Preventivi inviati",
  bookingsAsProfessional: "I tuoi lavori come professionista",
  reviewsReceived: "Recensioni ricevute",
  externalJobs: "Lavori esterni in agenda",
};

const ITEM_TITLES: Record<string, string> = {
  guidedRequests: "Richiesta",
  bookingsAsClient: "Lavoro",
  reviewsWritten: "Recensione",
  savedProfessionals: "Professionista salvato",
  services: "Prestazione",
  availabilitySlots: "Orario",
  leads: "Richiesta ricevuta",
  quotesSent: "Preventivo",
  bookingsAsProfessional: "Lavoro",
  reviewsReceived: "Recensione",
  externalJobs: "Lavoro esterno",
  quotes: "Preventivo ricevuto",
  items: "Voce",
};

/** Nomi dei campi più comuni; gli altri si scrivono separando le parole. */
const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  name: "Nome",
  surname: "Cognome",
  phone: "Telefono",
  role: "Tipo di account",
  street: "Via",
  houseNumber: "Numero civico",
  addressExtra: "Indicazioni",
  address: "Indirizzo",
  postalCode: "CAP",
  city: "Città",
  province: "Provincia",
  createdAt: "Creato il",
  updatedAt: "Ultima modifica",
  description: "Descrizione",
  status: "Stato",
  scheduledAt: "Appuntamento",
  scheduledEndAt: "Fine prevista",
  estimatedStartDate: "Data proposta",
  estimatedEndDate: "Fine proposta",
  recipientName: "Nome di chi riceve il professionista",
  recipientSurname: "Cognome di chi riceve il professionista",
  recipientPhone: "Telefono di chi riceve il professionista",
  rating: "Voto",
  comment: "Commento",
  text: "Testo",
  businessName: "Nome dell'attività",
  bio: "Presentazione",
  label: "Voce",
  notes: "Note",
  note: "Nota",
  cancellationNote: "Motivo dell'annullamento",
  canceledBy: "Annullato da",
  meetingLink: "Link della videochiamata",
  serviceMode: "Modalità",
  preferredDate: "Data preferita",
  preferredTimeSlot: "Fascia oraria preferita",
  dayOfWeek: "Giorno della settimana",
  startTime: "Dalle",
  endTime: "Alle",
  imageUrl: "Foto",
  emailVerifiedAt: "Email confermata il",
  whatsappNumber: "Numero WhatsApp",
  whatsappOptInAt: "Promemoria WhatsApp accesi il",
  whatsappOptOutAt: "Promemoria WhatsApp spenti il",
  refundRequested: "Rimborso chiesto",
  refundRequestedAt: "Rimborso chiesto il",
  professionalNote: "Tua nota sul lavoro",
  reply: "Risposta",
  title: "Titolo",
  exportedAt: "Scaricato il",
};

/** Campi tecnici che nel PDF non dicono nulla alla persona (restano nel JSON). */
const HIDDEN_FIELDS = new Set(["id", "deletedEmailHash", "sessionVersion", "adminTotpSecret", "adminTotpEnabledAt", "adminRoles", "notificationPrefs", "calendarFeedToken"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function humanize(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]!;
  const words = key.replace(/EurCents$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (typeof value === "number") {
    if (key.endsWith("EurCents")) return `${(value / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    return value.toLocaleString("it-IT");
  }
  if (typeof value === "string") return ISO_DATE.test(value) ? formatDate(new Date(value)) : value;
  if (Array.isArray(value)) {
    const parts = value.map((item) => (typeof item === "object" && item !== null ? null : formatValue(key, item))).filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** Righe di un oggetto: i campi semplici come righe, le liste di oggetti come gruppi sotto. */
function objectRows(record: Record<string, unknown>, depth: number): PdfRow[] {
  const rows: PdfRow[] = [];
  const nested: PdfRow[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (HIDDEN_FIELDS.has(key) || key.endsWith("Id") || key.endsWith("Hash") || key.endsWith("Token")) continue;
    if (Array.isArray(value) && value.some(isRecord)) {
      if (depth < 3) value.filter(isRecord).forEach((item, index) => nested.push({ group: `${ITEM_TITLES[key] ?? humanize(key)} ${index + 1}` }, ...objectRows(item, depth + 1)));
      continue;
    }
    if (isRecord(value)) {
      if (depth < 3) nested.push({ group: humanize(key) }, ...objectRows(value, depth + 1));
      continue;
    }
    const text = formatValue(key, value);
    if (text) rows.push({ label: humanize(key), detail: text, value: "" });
  }
  return [...rows, ...nested];
}

function sectionBlocks(key: string, value: unknown): PdfBlock[] {
  const title = SECTION_TITLES[key] ?? humanize(key);
  if (Array.isArray(value)) {
    const items = value.filter(isRecord);
    if (!items.length) return [{ type: "heading", text: title }, { type: "text", lines: ["Nessun dato."], muted: true }];
    const rows = items.flatMap((item, index) => [{ group: `${ITEM_TITLES[key] ?? "Elemento"} ${index + 1}` } as PdfRow, ...objectRows(item, 1)]);
    return [{ type: "heading", text: title }, { type: "rows", rows }];
  }
  if (isRecord(value)) {
    const rows = objectRows(value, 1);
    return rows.length ? [{ type: "heading", text: title }, { type: "rows", rows }] : [];
  }
  return [];
}

export function dataExportPdfModel(data: Record<string, unknown>): PdfDocumentModel {
  const blocks: PdfBlock[] = [
    {
      type: "text",
      lines: [
        `Copia dei dati personali del tuo account, scaricata il ${formatDate(new Date(String(data.exportedAt ?? new Date().toISOString())))}.`,
        "Lo stesso contenuto, con tutti i campi tecnici, è nel file JSON che scarichi da Impostazioni: serve per portare i dati su un altro servizio.",
      ],
      muted: true,
    },
  ];
  for (const [key, value] of Object.entries(data)) {
    if (key === "exportedAt") continue;
    if (key === "professional" && isRecord(value)) {
      for (const [proKey, proValue] of Object.entries(value)) blocks.push(...sectionBlocks(proKey, proValue));
      continue;
    }
    blocks.push(...sectionBlocks(key, value));
  }
  return { title: "I tuoi dati", subtitle: null, blocks };
}
