import { z } from "zod";
import "./zod";
import { trafficSourceSchema } from "./trafficSource";
import { PROFESSIONAL_CATEGORIES } from "./categories";
import { isPlausiblePhoneNumber, normalizePhoneNumber } from "./phoneCountries";
import { quotePaymentOfferSchema } from "./onlinePayments";
import { contentReportReason, contentReportReasonCodes, moderationGroundCodes } from "./moderation";
import { newPasswordSchema } from "./password";
import { REQUEST_TIMINGS } from "./requestTiming";
import { SERVICE_PRICE_UNITS } from "./professionals";

const categorySlugs = PROFESSIONAL_CATEGORIES.map((category) => category.slug) as [string, ...string[]];

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Orario non valido.");
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");
const timeRangeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/, "Fascia oraria non valida.");

/**
 * Email di un account: senza spazi e in minuscolo, così "Mario@Gmail.com" e
 * "mario@gmail.com" sono lo stesso account (docs/CHANGELOG.md §330).
 */
export const accountEmailSchema = z.string().trim().toLowerCase().email("Email non valida");

export const professionalCategorySlugSchema = z.enum(categorySlugs);

/**
 * Categorie di un professionista (docs/CHANGELOG.md §217, richiesta
 * dell'utente): da 1 a 3, scelte in registrazione e modificabili dal
 * profilo. La prima è la principale.
 */
export const MAX_PROFESSIONAL_CATEGORIES = 3;
const tooManyCategoriesMessage = `Puoi scegliere al massimo ${MAX_PROFESSIONAL_CATEGORIES} categorie.`;
export const NO_CATEGORY_MESSAGE = "Scegli almeno una categoria.";
export const NO_ENTITY_TYPE_MESSAGE = "Scegli se lavori come privato, con Partita IVA o come azienda.";
export const professionalCategorySlugsSchema = z
  .array(professionalCategorySlugSchema)
  .min(1, NO_CATEGORY_MESSAGE)
  .max(MAX_PROFESSIONAL_CATEGORIES, tooManyCategoriesMessage)
  .refine((slugs) => new Set(slugs).size === slugs.length, "Ogni categoria va scelta una volta sola.");

/**
 * Numero di telefono salvato sempre nello stesso formato, "+39 3331234567"
 * (docs/CHANGELOG.md §214): "333 1234567", "+39 333-1234567" e
 * "0039 3331234567" diventano lo stesso numero, così il controllo "numero
 * già usato da un altro account" non si lascia ingannare dal formato.
 * Vuoto resta vuoto (campo facoltativo).
 */
export const phoneNumberSchema = z
  .string()
  .max(30)
  .refine((value) => !value.trim() || isPlausiblePhoneNumber(value), "Numero di telefono non valido.")
  .transform((value) => (value.trim() ? normalizePhoneNumber(value) : ""));

export const googleVerifySchema = z.object({
  idToken: z.string().min(10),
  /** Usato solo se l'account Google non esiste ancora (nuova registrazione): un login su un account esistente non cambia mai il ruolo. */
  role: z.enum(["CLIENT", "PROFESSIONAL"]).optional(),
  /**
   * Se `false` (usato da /accedi), un token Google senza un account
   * esistente non ne crea uno nuovo: l'endpoint rifiuta con un errore
   * invece di iscrivere silenziosamente un cliente — bug reale segnalato
   * dall'utente, prima "Accedi con Google" su un'email mai registrata
   * creava comunque un account CLIENT invece di rimandare alla scelta
   * cliente/professionista su /registrati. Default `true` (comportamento
   * storico, usato da /registrati: lì "non esiste ancora" è proprio il
   * caso normale di una nuova registrazione).
   */
  createIfMissing: z.boolean().default(true),
  // Stesse due dichiarazioni obbligatorie di `registerSchema` (v. sopra),
  // richieste qui solo quando questa chiamata crea davvero un nuovo account
  // (mai su un login su un account esistente, dove questi campi restano
  // ininfluenti) — validato server-side in `AuthService.verifyGoogleToken`,
  // non da Zod stesso: qui restano opzionali perché lo stesso schema serve
  // anche a /accedi, che non li invia mai.
  acceptedLegalTerms: z.boolean().optional(),
  declaredAdult: z.boolean().optional(),
  // Categorie scelte da un professionista che si iscrive con Google
  // (docs/CHANGELOG.md §217): obbligatorie solo quando la chiamata crea un
  // nuovo account professionista, controllato in `AuthService.verifyGoogleToken`.
  categorySlugs: z.array(professionalCategorySlugSchema).max(MAX_PROFESSIONAL_CATEGORIES, tooManyCategoriesMessage).optional(),
  // Tipo del professionista (docs/CHANGELOG.md §243), obbligatorio come le
  // categorie solo quando la chiamata crea un nuovo account professionista.
  entityType: z.enum(["PRIVATE_INDIVIDUAL", "SOLE_PROPRIETOR", "BUSINESS"]).optional(),
  // Da dove arrivava la visita, se la chiamata crea un account (docs/CHANGELOG.md §372).
  signupSource: trafficSourceSchema.optional(),
});
export type GoogleVerifyInput = z.infer<typeof googleVerifySchema>;

/** Iscrizione alla waitlist "in costruzione" della homepage (redesign "Scheda Intervento" §4.6). */
export const waitlistSignupSchema = z.object({
  email: z.string().email("Email non valida"),
  // Honeypot anti-spam (Fase 6): campo tenuto vuoto e nascosto in UI per un
  // utente reale, ma visibile ai bot che compilano ogni campo del form —
  // se arriva valorizzato, il controller finge un successo senza salvare
  // nulla (apps/api/src/waitlist/waitlist.controller.ts).
  website: z.string().max(200).optional(),
});
export type WaitlistSignupInput = z.infer<typeof waitlistSignupSchema>;

/**
 * Messaggio di contatto (footer, colonna "Contatti" al posto dell'elenco
 * categorie "Servizi" — richiesta esplicita dell'utente, ispirata a un
 * riferimento screenshot). Nessun account richiesto per inviarlo, stesso
 * principio già seguito per `waitlistSignupSchema` sopra.
 */
export const contactMessageRoleSchema = z.enum(["CLIENT", "PROFESSIONAL", "OTHER", "REPORT_ILLEGAL"]);
/**
 * Token del widget anti-bot Cloudflare Turnstile (docs/CHANGELOG.md §204):
 * controllato dal server solo se `TURNSTILE_SECRET_KEY` è impostata.
 */
export const turnstileTokenSchema = z.string().max(2048).optional();

export const contactMessageSchema = z
  .object({
    role: contactMessageRoleSchema,
    email: z.string().email("Email non valida"),
    content: z.string().min(1, "Scrivi un messaggio.").max(4000, "Messaggio troppo lungo."),
    // Dichiarazione di buona fede, obbligatoria per una segnalazione di
    // contenuto illegale (DSA art. 16 c. 2 lett. d, docs/CHANGELOG.md §319).
    goodFaith: z.boolean().optional(),
    // Nome di chi segnala e indirizzo del contenuto, in campi a sé (DSA art.
    // 16 c. 2 lett. b-c; collaudo del 29/10/2026, M-09).
    reporterName: z.string().trim().max(120).optional(),
    contentUrl: z.string().trim().max(1000).optional(),
    // Honeypot anti-spam, stesso pattern di waitlistSignupSchema.
    website: z.string().max(200).optional(),
    turnstileToken: turnstileTokenSchema,
  })
  .superRefine((data, ctx) => {
    if (data.role !== "REPORT_ILLEGAL") return;
    if (data.content.trim().length < 20) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["content"], message: "Spiega perché il contenuto è illegale." });
    }
    if ((data.reporterName ?? "").length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reporterName"], message: "Scrivi il tuo nome e cognome." });
    }
    if (!data.contentUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contentUrl"], message: "Incolla l'indirizzo della pagina con il contenuto." });
    }
    if (data.goodFaith !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["goodFaith"], message: "Conferma che la segnalazione è fatta in buona fede." });
    }
  });
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const resolveContactMessageSchema = z.object({
  resolved: z.boolean(),
});
export type ResolveContactMessageInput = z.infer<typeof resolveContactMessageSchema>;

/** Login via email + password (CLAUDE.md §8). */
export const emailPasswordSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});
export type EmailPasswordInput = z.infer<typeof emailPasswordSchema>;

/**
 * Primo passo dell'accesso "prima l'email" dei clienti (sul modello di
 * MioDottore, docs/CHANGELOG.md §176): solo l'email, per sapere se chiedere
 * la password, farne scegliere una nuova o rimandare a Google.
 */
export const emailStatusSchema = z.object({
  email: accountEmailSchema,
});
export type EmailStatusInput = z.infer<typeof emailStatusSchema>;
/** `new`: nessun account; `password`: accesso con password; `google`: account creato con Google, senza password. */
export type EmailStatus = "new" | "password" | "google";

/**
 * Versione delle informative (Privacy Policy + Termini di Servizio) accettate
 * in registrazione — stessa stringa "Ultimo aggiornamento" mostrata su
 * /privacy e /termini. Richiesta esplicita dell'utente ("Verbale di
 * Conformità"): un cambio sostanziale delle informative va accompagnato da
 * un aggiornamento di questa costante, così le registrazioni successive
 * tracciano la versione realmente accettata — mai retroattivo sugli account
 * già creati (`User.legalConsentVersion` resta quella accettata a suo tempo).
 */
export const LEGAL_CONSENT_VERSION = "2026-10-24";

export const registerSchema = emailPasswordSchema.extend({
  // Password nuova: regole sotto il campo (docs/CHANGELOG.md §289). Il login
  // resta su emailPasswordSchema, così le password vecchie continuano a entrare.
  password: newPasswordSchema,
  name: z.string().min(2).max(120).optional(),
  role: z.enum(["CLIENT", "PROFESSIONAL"]).default("CLIENT"),
  // Due dichiarazioni obbligatorie richieste esplicitamente dall'utente
  // ("Verbale di Conformità"): prima nessun atto tracciato confermava che
  // l'utente avesse letto le informative, né esisteva una dichiarazione di
  // maggiore età. Solo autocertificazione (nessuna verifica reale
  // dell'età, coerente col resto del prodotto — es. le qualifiche
  // professionali sono anch'esse autodichiarate, CLAUDE.md §"Verbale").
  acceptedLegalTerms: z.boolean().refine((v) => v === true, "Devi accettare Privacy Policy e Termini di Servizio."),
  declaredAdult: z.boolean().refine((v) => v === true, "Devi dichiarare di avere almeno 18 anni."),
  turnstileToken: turnstileTokenSchema,
  // Da 1 a 3 categorie, obbligatorie solo per un professionista
  // (docs/CHANGELOG.md §217): precompilano il suo profilo.
  categorySlugs: z.array(professionalCategorySlugSchema).max(MAX_PROFESSIONAL_CATEGORIES, tooManyCategoriesMessage).optional(),
  // Privato, P.IVA o azienda (docs/CHANGELOG.md §243): obbligatorio solo per
  // un professionista, precompila i dati fiscali.
  entityType: z.enum(["PRIVATE_INDIVIDUAL", "SOLE_PROPRIETOR", "BUSINESS"]).optional(),
  // Da dove arrivava la visita (Google, social...), docs/CHANGELOG.md §372.
  signupSource: trafficSourceSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.role === "PROFESSIONAL" && !data.entityType) {
    ctx.addIssue({ code: "custom", message: NO_ENTITY_TYPE_MESSAGE, path: ["entityType"] });
  }
  if (data.role === "PROFESSIONAL" && !data.categorySlugs?.length) {
    ctx.addIssue({ code: "custom", message: NO_CATEGORY_MESSAGE, path: ["categorySlugs"] });
  }
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Modifica dati anagrafici dal proprio account (CLAUDE.md §8 — impostazioni
 * account). Campi indirizzo (street/houseNumber/addressExtra/postalCode/
 * city/province) facoltativi anche qui — richiesta esplicita dell'utente:
 * servono solo da prefill per GuidedRequestForm quando presenti, non sono
 * mai obbligatori per usare l'account.
 */
export const updateAccountSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  surname: z.string().min(1).max(120).optional(),
  email: accountEmailSchema.optional(),
  phone: phoneNumberSchema.optional(),
  street: z.string().max(200).optional(),
  houseNumber: z.string().max(20).optional(),
  addressExtra: z.string().max(200).optional(),
  postalCode: z.string().max(10).optional(),
  city: z.string().max(120).optional(),
  province: z.string().max(50).optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

/**
 * Preferenze dell'interfaccia salvate sull'account (docs/CHANGELOG.md §334):
 * menu laterale ridotto a icone, `null` = decide la larghezza dello schermo.
 */
export const updatePreferencesSchema = z.object({
  sidebarCollapsed: z.boolean().nullable(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/**
 * Cambio password: currentPassword obbligatoria solo se l'account ne ha già
 * una impostata (un account creato via Google potrebbe non averla ancora).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).optional(),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Link di conferma email (docs/CHANGELOG.md §178). */
export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Codice di 6 cifre arrivato con l'email di conferma (docs/CHANGELOG.md
 * §243): spazi e trattini incollati insieme al codice vengono ignorati.
 */
export const EMAIL_CODE_LENGTH = 6;
export const verifyEmailCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .refine((value) => /^\d{6}$/.test(value), `Il codice è fatto di ${EMAIL_CODE_LENGTH} cifre.`),
});
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

/** Recupero password (docs/CHANGELOG.md §185): richiesta del link. */
export const passwordResetRequestSchema = z.object({
  email: accountEmailSchema,
  turnstileToken: turnstileTokenSchema,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

/** Recupero password: nuova password scelta dal link ricevuto. */
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: newPasswordSchema,
});
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

/**
 * Recupero password con il codice di 6 cifre della stessa email (§245): se è
 * giusto, il server restituisce un link nuovo per scegliere la password.
 */
export const passwordResetCodeSchema = verifyEmailCodeSchema.extend({
  email: accountEmailSchema,
});
export type PasswordResetCodeInput = z.infer<typeof passwordResetCodeSchema>;

/** Categorie scelte insieme in una richiesta di preventivo generale (docs/CHANGELOG.md §259). */
export const MAX_REQUEST_CATEGORIES = 3;
const tooManyRequestCategoriesMessage = `Puoi scegliere al massimo ${MAX_REQUEST_CATEGORIES} categorie.`;
/** Professionisti scelti dai risultati per una sola richiesta (docs/CHANGELOG.md §393, decisione di Luca: fino a 5). */
export const MAX_CHOSEN_PROFESSIONALS = 5;

/** Richiesta guidata cliente: foto + poche domande → categoria/prezzo stimato (CLAUDE.md §8). */
export const guidedRequestSchema = z
  .object({
    categorySlug: professionalCategorySlugSchema,
    /**
     * Altre categorie della stessa richiesta generale (docs/CHANGELOG.md
     * §259, richiesta dell'utente): diventa una richiesta separata per
     * ognuna, con gli stessi dati. Mai in una richiesta diretta.
     */
    extraCategorySlugs: z.array(professionalCategorySlugSchema).max(MAX_REQUEST_CATEGORIES - 1, tooManyRequestCategoriesMessage).default([]),
    description: z.string().min(10).max(2000),
    /**
     * Facoltativa (richiesta esplicita dell'utente: "in tutte le richieste
     * preventivo, non rendere obbligatorio l'inserimento di foto/video" —
     * ribalta una decisione precedente, "tutte le voci del richiedi un
     * preventivo devono essere obbligatorie", che l'aveva resa obbligatoria).
     * Fino a 5 elementi, foto e video mescolabili liberamente (richiesta
     * esplicita dell'utente: "aumenta il limite a 5" e "dai la possibilità
     * di caricare anche i video") — lo stesso array di URL vale per
     * entrambi i tipi di media, distinti solo dall'estensione del file
     * (vedi isVideoUrl in apps/web).
     */
    photoUrls: z.array(z.string().url()).max(5).default([]),
    /**
     * Obbligatoria a domicilio e in ogni richiesta generale, anche online
     * (docs/CHANGELOG.md §210: decide a chi arriva). Facoltativa solo per
     * una consulenza online a un professionista scelto: se vuota, l'inoltro
     * usa la città del professionista (§209).
     */
    city: z.string().optional(),
    /**
     * Via + destinatario + resto dell'indirizzo strutturato: obbligatori
     * solo per un intervento "a domicilio" (`serviceMode === "HOME"`),
     * facoltativi per "online" — richiesta esplicita dell'utente: una
     * consulenza online non richiede di sapere dove passare, l'intero
     * blocco "Chi riceverà il professionista" resta nascosto in quel caso
     * lato UI (`GuidedRequestForm`). Obbligatorietà condizionale applicata
     * sotto con `.superRefine` invece che qui, per poter dare un messaggio
     * per campo identico a prima quando `serviceMode` è "HOME". Restano
     * comunque invisibili al professionista finché non si conclude la
     * trattativa (vedi ProfessionalsService.getMyLeads).
     */
    address: z.string().max(200).optional(),
    recipientName: z.string().max(120).optional(),
    recipientSurname: z.string().max(120).optional(),
    recipientPhone: phoneNumberSchema.optional(),
    houseNumber: z.string().max(20).optional(),
    addressExtra: z.string().max(200).optional(),
    postalCode: z.string().max(10).optional(),
    province: z.string().max(50).optional(),
    isUrgent: z.boolean().default(false),
    /** Quando serve (docs/CHANGELOG.md §344): se c'è, decide anche `isUrgent` ("Oggi"). */
    timing: z.enum(REQUEST_TIMINGS).optional(),
    /**
     * Tipo di intervento (richiesta esplicita dell'utente: "in modo che il
     * professionista già sa se può trattarsi di un intervento a domicilio o
     * online"), obbligatorio come gli altri campi della richiesta.
     */
    serviceMode: z.enum(["HOME", "ONLINE"], { message: "Indica se l'intervento è a domicilio o online." }),
    /** Se presente, la richiesta va solo a questo professionista (partita dal suo profilo pubblico), non in fan-out. */
    professionalProfileId: z.guid().optional(),
    /**
     * Da 2 a 5 professionisti scelti dai risultati (docs/CHANGELOG.md §393):
     * una sola richiesta, che arriva solo a loro. Mai insieme a
     * `professionalProfileId` (un solo professionista è una richiesta diretta).
     */
    professionalProfileIds: z
      .array(z.guid())
      .min(2, "Scegli almeno 2 professionisti.")
      .max(MAX_CHOSEN_PROFESSIONALS, `Puoi scegliere al massimo ${MAX_CHOSEN_PROFESSIONALS} professionisti.`)
      .optional(),
    /**
     * Richiesta diretta a un professionista: se non risponde in tempo o
     * rifiuta, inoltrala ad altri professionisti simili (docs/CHANGELOG.md
     * §154, decisione dell'utente: casella attiva di default, il cliente
     * può toglierla). Ignorata per le richieste generiche.
     */
    forwardIfNoReply: z.boolean().default(false),
    /**
     * Data+fascia oraria preferita: valorizzate solo quando la richiesta
     * parte da una fascia "generica" dell'agenda pubblica di un
     * professionista (AvailabilitySlot.maxBookings > 1) — vedi
     * packages/shared/src/availability.ts. Richiedono sempre
     * professionalProfileId (una fascia generica appartiene a un
     * professionista specifico).
     */
    preferredDate: isoDateSchema.optional(),
    preferredTimeSlot: timeRangeSchema.optional(),
    /** Da dove è arrivato il cliente nella visita che porta alla richiesta (docs/CHANGELOG.md §296). */
    trafficSource: trafficSourceSchema.optional(),
  })
  .refine((data) => Boolean(data.preferredDate) === Boolean(data.preferredTimeSlot), {
    message: "Data e fascia oraria preferita vanno indicate insieme.",
    path: ["preferredTimeSlot"],
  })
  .refine((data) => !data.preferredDate || Boolean(data.professionalProfileId), {
    message: "Una fascia oraria preferita richiede un professionista specifico.",
    path: ["professionalProfileId"],
  })
  .refine((data) => !data.professionalProfileId || data.extraCategorySlugs.length === 0, {
    message: "Una richiesta a un professionista scelto ha una sola categoria.",
    path: ["extraCategorySlugs"],
  })
  .refine((data) => !data.professionalProfileIds || (!data.professionalProfileId && data.extraCategorySlugs.length === 0 && !data.preferredDate), {
    message: "Una richiesta ai professionisti scelti ha una sola categoria e nessuna fascia oraria.",
    path: ["professionalProfileIds"],
  })
  .refine((data) => !data.professionalProfileIds || new Set(data.professionalProfileIds).size === data.professionalProfileIds.length, {
    message: "Ogni professionista va scelto una volta sola.",
    path: ["professionalProfileIds"],
  })
  .refine((data) => new Set([data.categorySlug, ...data.extraCategorySlugs]).size === data.extraCategorySlugs.length + 1, {
    message: "Ogni categoria va scelta una volta sola.",
    path: ["extraCategorySlugs"],
  })
  // Indirizzo/destinatario obbligatori solo per un intervento "a domicilio"
  // (vedi commento sui singoli campi sopra) — stessi messaggi già in uso
  // prima che questi campi diventassero facoltativi.
  .superRefine((data, ctx) => {
    // Richiesta generale: città sempre obbligatoria, anche online — decide a
    // quali professionisti arriva (docs/CHANGELOG.md §210).
    if (data.serviceMode !== "HOME") {
      if (!data.professionalProfileId && !data.city?.trim())
        ctx.addIssue({ code: "custom", message: "La città è obbligatoria.", path: ["city"] });
      return;
    }
    if (!data.city?.trim()) ctx.addIssue({ code: "custom", message: "La città è obbligatoria.", path: ["city"] });
    if (!data.address?.trim()) ctx.addIssue({ code: "custom", message: "L'indirizzo è obbligatorio.", path: ["address"] });
    if (!data.recipientName?.trim()) ctx.addIssue({ code: "custom", message: "Il nome è obbligatorio.", path: ["recipientName"] });
    if (!data.recipientSurname?.trim())
      ctx.addIssue({ code: "custom", message: "Il cognome è obbligatorio.", path: ["recipientSurname"] });
    if (!data.recipientPhone || data.recipientPhone.trim().length < 6)
      ctx.addIssue({ code: "custom", message: "Numero di telefono non valido.", path: ["recipientPhone"] });
    if (!data.houseNumber?.trim())
      ctx.addIssue({ code: "custom", message: "Il numero civico è obbligatorio.", path: ["houseNumber"] });
    if (!data.postalCode?.trim()) ctx.addIssue({ code: "custom", message: "Il CAP è obbligatorio.", path: ["postalCode"] });
    if (!data.province?.trim()) ctx.addIssue({ code: "custom", message: "La provincia è obbligatoria.", path: ["province"] });
  });
export type GuidedRequestInput = z.infer<typeof guidedRequestSchema>;

/**
 * Modifica di una richiesta già inviata (descrizione, città, indirizzo e
 * foto: la categoria non è modificabile perché determina già a quali
 * professionisti è stata inoltrata la richiesta — cambiarla dopo il
 * fan-out non avrebbe senso). Consentita solo finché la richiesta non è
 * `CLOSED` (vedi GuidedRequestsService.update). `photoUrls` opzionale
 * (non `.default([])` come in guidedRequestSchema): se assente il set di
 * foto esistente non viene toccato, se presente sostituisce l'intero set
 * — stesso pattern "sostituzione per intero" già in uso per le prestazioni
 * professionista e le voci di preventivo.
 */
export const guidedRequestUpdateSchema = z
  .object({
    description: z.string().min(10).max(2000),
    /** Facoltativa per un intervento online, stesso principio di guidedRequestSchema.city. */
    city: z.string().optional(),
    serviceMode: z.enum(["HOME", "ONLINE"]).optional(),
    address: z.string().max(200).optional(),
    recipientName: z.string().max(120).optional(),
    recipientSurname: z.string().max(120).optional(),
    recipientPhone: phoneNumberSchema.optional(),
    houseNumber: z.string().max(20).optional(),
    addressExtra: z.string().max(200).optional(),
    postalCode: z.string().max(10).optional(),
    province: z.string().max(50).optional(),
    photoUrls: z.array(z.string().url()).max(5).optional(),
  })
  .superRefine((data, ctx) => {
    // serviceMode è opzionale qui (modifica: la modalità potrebbe non
    // cambiare) — la città resta obbligatoria solo se esplicitamente
    // impostata su "HOME" in questa stessa modifica. Se `serviceMode` è
    // assente non blocchiamo: il form di modifica non permette di
    // cambiare la modalità, quindi non c'è nulla da validare qui contro
    // un valore che non arriva mai in questo payload.
    if (data.serviceMode === "HOME" && !data.city?.trim()) {
      ctx.addIssue({ code: "custom", message: "La città è obbligatoria.", path: ["city"] });
    }
  });
export type GuidedRequestUpdateInput = z.infer<typeof guidedRequestUpdateSchema>;

/**
 * Aggiornamento scritto a mano da cliente o professionista sulla cronologia
 * di una richiesta guidata (richiesta esplicita dell'utente: "tieni traccia
 * delle varie conversazioni... dai la possibilità ad entrambi di inserire
 * foto e video dell'aggiornamento dei lavori") — a differenza degli eventi
 * automatici del ciclo di vita (invio preventivo, accettazione, ecc.,
 * generati dal backend), questo è un messaggio libero: serve almeno un
 * testo o almeno una foto/video, non un evento del tutto vuoto.
 */
export const timelineUpdateSchema = z
  .object({
    professionalProfileId: z.guid(),
    message: z.string().trim().max(2000).optional().default(""),
    mediaUrls: z.array(z.string().url()).max(5).optional().default([]),
  })
  .refine((data) => data.message.length > 0 || data.mediaUrls.length > 0, {
    message: "Scrivi un messaggio o allega almeno una foto/video.",
    path: ["message"],
  });
export type TimelineUpdateInput = z.infer<typeof timelineUpdateSchema>;

/** Preventivo strutturato in-app (CLAUDE.md §8): niente scambio libero di contatti. */
/** Voce di un preventivo (es. "Manodopera", "Materiali"): nome + range di prezzo, stesso pattern di professionalServiceSchema. */
export const quoteItemSchema = z
  .object({
    name: z.string().min(2).max(120),
    priceMinEurCents: z.number().int().nonnegative().optional(),
    priceMaxEurCents: z.number().int().nonnegative().optional(),
  })
  .refine((data) => data.priceMinEurCents === undefined || data.priceMaxEurCents === undefined || data.priceMaxEurCents >= data.priceMinEurCents, {
    message: "Il prezzo massimo deve essere maggiore o uguale al minimo.",
    path: ["priceMaxEurCents"],
  });
export type QuoteItemInput = z.infer<typeof quoteItemSchema>;

export const quoteSchema = z.object({
  requestId: z.guid(),
  professionalProfileId: z.guid(),
  items: z.array(quoteItemSchema).min(1).max(20),
  estimatedStartDate: z.string().datetime(),
  /**
   * Fine della fascia scelta dall'agenda del professionista (richiesta
   * esplicita dell'utente: "non visualizzare solo il primo orario ma
   * tutta la fascia d'orario") — facoltativa: assente quando la data è
   * indicata a mano senza un'agenda impostata (nessuna fascia con fine
   * nota da cui derivarla).
   */
  estimatedEndDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  /** Modi di pagamento offerti al cliente e percentuale dell'acconto online (docs/CHANGELOG.md §237); assenti = valori di serie. */
  ...quotePaymentOfferSchema,
  /** Preavviso per annullare di questo preventivo (docs/CHANGELOG.md §348); assente = quello del profilo. */
  cancellationNoticeHours: z.union([z.literal(24), z.literal(48), z.literal(72)]).optional(),
  /** Annullando dentro il preavviso l'acconto online resta al professionista; vale solo con l'acconto online. */
  lateCancelKeepsDeposit: z.boolean().optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

/** Preventivo inviato dal professionista autenticato: professionalProfileId viene dal JWT, non dal body. */
export const quoteSelfSchema = quoteSchema.omit({ professionalProfileId: true });
export type QuoteSelfInput = z.infer<typeof quoteSelfSchema>;

/**
 * Il cliente propone una data diversa per un preventivo ricevuto, scelta
 * tra le fasce libere dell'agenda del professionista (mai una data libera
 * scollegata: sarebbe validata comunque server-side, meglio vincolarla già
 * qui). Stessa struttura date+startTime+endTime già usata per le fasce
 * generiche dell'agenda in guidedRequestSchema.
 */
export const proposeQuoteDateSchema = z.object({
  date: isoDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  /** Dettagli facoltativi sulla data proposta (es. "posso solo dopo le 17"), mostrati al professionista. */
  note: z.string().max(1000).optional(),
  /**
   * Richiesta esplicita dell'utente: quando il professionista usa
   * "Proponi un'altra data" (counter-propose-date) o il cliente sceglie
   * "Altro" nel menu a tendina data/ora (propose-date) deve poter inserire
   * un orario libero, non necessariamente presente nell'agenda del
   * professionista — finirà comunque sul calendario come "In attesa"
   * (stesso principio già in uso per la data manuale nell'invio del primo
   * preventivo). Se vero, il backend salta la validazione contro
   * AvailabilitySlot.
   */
  isManual: z.boolean().optional(),
});
export type ProposeQuoteDateInput = z.infer<typeof proposeQuoteDateSchema>;

/**
 * Il professionista, ricevuta una data alternativa proposta dal cliente
 * (MODIFICATION_REQUESTED), modifica direttamente l'orario invece di
 * limitarsi a confermare o rifiutare — richiesta esplicita dell'utente
 * ("Modifica... dove può modificare sia la data che l'orario... con una
 * casella di testo dove si può scrivere qualcosa e inviare"). Stessa
 * struttura di proposeQuoteDateSchema.
 */
export const counterProposeQuoteDateSchema = proposeQuoteDateSchema;
export type CounterProposeQuoteDateInput = z.infer<typeof counterProposeQuoteDateSchema>;

/**
 * Il cliente rifiuta un preventivo con una nota facoltativa per il
 * professionista (docs/CHANGELOG.md §188), es. "il prezzo è troppo alto" o
 * "mi serve prima di venerdì": gli serve per decidere se inviarne uno nuovo.
 */
export const rejectQuoteSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type RejectQuoteInput = z.infer<typeof rejectQuoteSchema>;

/**
 * Voce dell'importo finale di un lavoro completato (richiesta esplicita
 * dell'utente): a differenza di quoteItemSchema qui il prezzo è un valore
 * esatto, non un range — il professionista sta comunicando quanto ha
 * effettivamente addebitato, non più stimando.
 */
export const bookingFinalItemSchema = z.object({
  name: z.string().min(1, "Il nome della voce è obbligatorio.").max(120),
  priceEurCents: z.number().int().nonnegative().max(100_000_00),
});
export type BookingFinalItemInput = z.infer<typeof bookingFinalItemSchema>;

/**
 * Il professionista segnala un lavoro come terminato, inserendo l'importo
 * preciso (voci del preventivo + eventuali extra) — `photoUrls` facoltative
 * (richiesta esplicita dell'utente: "dai la possibilità di inserire delle
 * foto del lavoro terminato"), stesso limite/pattern delle altre gallerie
 * del prodotto.
 */
export const completeBookingSchema = z.object({
  items: z.array(bookingFinalItemSchema).min(1, "Aggiungi almeno una voce.").max(20),
  photoUrls: z.array(z.string().url()).max(5).default([]),
  /** Note facoltative sul lavoro svolto (docs/CHANGELOG.md §163), lette dall'admin. */
  note: z.string().trim().max(1000).optional(),
  /** Motivo di voci aggiunte o totale fuori dal preventivo: obbligatorio in quel caso (`completionDeviation`). */
  changeReason: z.string().trim().max(1000).optional(),
  /**
   * Versione della dichiarazione sull'importo accettata con la spunta
   * (`completionDeclaration` in dac7.ts, docs/CHANGELOG.md §246): il server
   * la confronta con quella del tipo fiscale del professionista.
   */
  declarationVersion: z.string({ error: (issue) => (issue.input === undefined ? "Conferma la dichiarazione sull'importo." : undefined) }).trim().min(1, "Conferma la dichiarazione sull'importo.").max(60),
});
export type CompleteBookingInput = z.infer<typeof completeBookingSchema>;

/**
 * Il cliente conferma dal proprio lato che il lavoro è davvero terminato
 * (richiesta esplicita dell'utente: "servono i completed da entrambi") —
 * indipendente dall'importo/stato, che restano pilotati dal professionista.
 * Foto facoltative, stesso limite delle altre gallerie.
 */
export const clientConfirmCompleteSchema = z.object({
  photoUrls: z.array(z.string().url()).max(5).default([]),
  /** Note facoltative del cliente sul lavoro (docs/CHANGELOG.md §163), lette dall'admin. */
  note: z.string().trim().max(1000).optional(),
});
export type ClientConfirmCompleteInput = z.infer<typeof clientConfirmCompleteSchema>;

/** Il professionista annulla un intervento già confermato, con una nota facoltativa spiegata al cliente. */
export const cancelBookingByProfessionalSchema = z.object({
  note: z.string().max(1000).optional(),
});
export type CancelBookingByProfessionalInput = z.infer<typeof cancelBookingByProfessionalSchema>;

/** Il professionista rifiuta una richiesta ricevuta prima di inviare un preventivo, con una nota facoltativa per il cliente. */
export const declineLeadSchema = z.object({
  note: z.string().max(1000).optional(),
});
export type DeclineLeadInput = z.infer<typeof declineLeadSchema>;

/**
 * Nota privata del professionista su una prenotazione (richiesta esplicita
 * dell'utente: "eventuali note da ricordare") — mai vista dal cliente, a
 * differenza di cancelBookingByProfessionalSchema sopra. Stringa vuota
 * salvata come `null` (nota rimossa), stesso pattern già in uso altrove
 * per i campi testo facoltativi di questo modulo.
 */
export const updateBookingNoteSchema = z.object({
  note: z.string().max(2000),
});
export type UpdateBookingNoteInput = z.infer<typeof updateBookingNoteSchema>;

/**
 * Nota privata del professionista su una richiesta ricevuta (pagina
 * `/dashboard/richieste`), stesso schema di `updateBookingNoteSchema` ma
 * valorizzabile prima ancora che esista una prenotazione.
 */
export const updateLeadNoteSchema = z.object({
  note: z.string().max(2000),
});
export type UpdateLeadNoteInput = z.infer<typeof updateLeadNoteSchema>;

/**
 * Link per una consulenza video (Meet, Zoom, ecc.), facoltativo — richiesta
 * esplicita dell'utente per la "consulenza online" (CLAUDE.md §1). Nessuna
 * integrazione reale con un servizio di videochiamata: il professionista
 * incolla qui il link della propria riunione, come per una nota testuale.
 * Stringa vuota salvata come `null` (link rimosso), stesso pattern di
 * updateBookingNoteSchema sopra. Validazione URL leggera solo quando non
 * vuoto (mai bloccare la rimozione).
 */
export const updateBookingMeetingLinkSchema = z.object({
  meetingLink: z
    .string()
    .max(500)
    .refine((value) => value.trim() === "" || /^https?:\/\//i.test(value.trim()), {
      message: "Il link deve iniziare con http:// o https://",
    }),
});
export type UpdateBookingMeetingLinkInput = z.infer<typeof updateBookingMeetingLinkSchema>;

/**
 * Lavoro preso al di fuori della piattaforma (richiesta esplicita
 * dell'utente): il professionista lo inserisce a mano nella propria
 * agenda con tutti i dati utili per svolgerlo — nessun account cliente
 * reale dietro, quindi solo campi liberi, non l'indirizzo strutturato di
 * `acceptQuoteSchema` (che presuppone la schermata di accettazione di un
 * preventivo vero). `scheduledEndAt`, se presente, deve seguire l'inizio.
 */
export const externalJobSchema = z
  .object({
    clientName: z.string().trim().min(1, "Il nome del cliente è obbligatorio.").max(160),
    clientPhone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    description: z.string().trim().max(2000).optional(),
    scheduledAt: z.string().datetime(),
    scheduledEndAt: z.string().datetime().optional(),
    priceEurCents: z.number().int().nonnegative().max(100_000_00).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => !data.scheduledEndAt || data.scheduledEndAt > data.scheduledAt, {
    message: "L'orario di fine deve essere dopo l'orario di inizio.",
    path: ["scheduledEndAt"],
  });
export type ExternalJobInput = z.infer<typeof externalJobSchema>;

/** Modifica di un lavoro esterno già inserito: stessi campi, tutti facoltativi (si aggiorna solo ciò che è cambiato). */
export const externalJobUpdateSchema = z
  .object({
    clientName: z.string().trim().min(1, "Il nome del cliente è obbligatorio.").max(160).optional(),
    clientPhone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    description: z.string().trim().max(2000).optional(),
    scheduledAt: z.string().datetime().optional(),
    scheduledEndAt: z.string().datetime().optional(),
    priceEurCents: z.number().int().nonnegative().max(100_000_00).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => !data.scheduledEndAt || !data.scheduledAt || data.scheduledEndAt > data.scheduledAt, {
    message: "L'orario di fine deve essere dopo l'orario di inizio.",
    path: ["scheduledEndAt"],
  });
export type ExternalJobUpdateInput = z.infer<typeof externalJobUpdateSchema>;

export const externalJobStatusSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELED"]),
});
export type ExternalJobStatusInput = z.infer<typeof externalJobStatusSchema>;

/**
 * Raggio di ingaggio del professionista (km, indipendenti tra standard e
 * urgente — richiesta esplicita dell'utente): usati da
 * GuidedRequestsService per il filtro geografico del fan-out invece di una
 * costante fissa uguale per tutti. Range validato qui (unica fonte di
 * verità, stessa pipe ZodValidationPipe già in uso per ogni altro endpoint
 * di questo modulo): 1-35 km per le standard (fino a 35 su richiesta
 * dell'utente, il valore iniziale resta 25), 1-25 km per le urgenti — mai
 * un raggio a 0 (nessuna copertura).
 */
export const MAX_ENGAGEMENT_RADIUS_KM = 35;
export const MAX_URGENT_ENGAGEMENT_RADIUS_KM = 25;

export const updateEngagementRadiusSchema = z.object({
  engagementRadiusKm: z
    .number()
    .min(1, "Il raggio deve essere almeno 1 km.")
    .max(MAX_ENGAGEMENT_RADIUS_KM, `Il raggio non può superare ${MAX_ENGAGEMENT_RADIUS_KM} km.`),
  urgentEngagementRadiusKm: z
    .number()
    .min(1, "Il raggio urgente deve essere almeno 1 km.")
    .max(MAX_URGENT_ENGAGEMENT_RADIUS_KM, `Il raggio urgente non può superare ${MAX_URGENT_ENGAGEMENT_RADIUS_KM} km.`),
});
export type UpdateEngagementRadiusInput = z.infer<typeof updateEngagementRadiusSchema>;

/** Recensione: consentita solo se legata a una prenotazione confermata (CLAUDE.md §8). */
export const reviewSchema = z.object({
  bookingId: z.guid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  /** Foto o video del lavoro svolto, opzionali (fino a 5): mostrati poi nella sezione recensioni del professionista. */
  photoUrls: z.array(z.string().url()).max(5).default([]),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Prestazione offerta dal professionista: nome + prezzo facoltativo (in centesimi). */
export const professionalServiceSchema = z
  .object({
    name: z.string().min(2).max(120),
    priceMinEurCents: z.number().int().nonnegative().optional(),
    priceMaxEurCents: z.number().int().nonnegative().optional(),
    /** A cosa si riferisce il prezzo (§398); senza, "a lavoro". */
    priceUnit: z.enum(SERVICE_PRICE_UNITS).optional(),
  })
  .refine((data) => data.priceMinEurCents === undefined || data.priceMaxEurCents === undefined || data.priceMaxEurCents >= data.priceMinEurCents, {
    message: "Il prezzo massimo deve essere maggiore o uguale al minimo.",
    path: ["priceMaxEurCents"],
  });
export type ProfessionalServiceInput = z.infer<typeof professionalServiceSchema>;

export const professionalProfileSchema = z.object({
  userId: z.guid(),
  // Da 1 a 3, la prima è la principale (docs/CHANGELOG.md §217).
  categorySlugs: professionalCategorySlugsSchema,
  subTags: z.array(z.string()).default([]),
  businessName: z.string().min(2).max(120),
  city: z.string().min(2),
  address: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bio: z.string().max(2000).optional(),
  remoteAvailable: z.boolean().default(false),
  services: z.array(professionalServiceSchema).max(30).default([]),
  // Opzionale: un professionista può caricare la foto prima ancora di aver
  // salvato il resto del profilo (è la prima sezione del form in
  // /dashboard/profilo) — in quel caso non esiste ancora una riga
  // ProfessionalProfile su cui persisterla subito, quindi l'URL resta in
  // stato locale finché non arriva qui, nel primo salvataggio vero e proprio.
  imageUrl: z.string().url().optional(),
  // Foto reali di lavori svolti (fino a 10), richiesta esplicita
  // dell'utente: "un'idea dei lavori svolti" aprendo il profilo pubblico —
  // stesso pattern/limite di GuidedRequest.photoUrls.
  portfolioUrls: z.array(z.string().url()).max(10).default([]),
  // Lingue parlate (richiesta esplicita dell'utente, filtro "Lingua parlata"
  // in ricerca): "Italiano" precompilato di default alla creazione del
  // profilo (stesso default dello schema Prisma), rimovibile/estendibile —
  // nessun minimo richiesto qui, un professionista può rimuoverle tutte.
  spokenLanguages: z.array(z.string().min(1).max(40)).max(10).default(["Italiano"]),
  // Segnali di fiducia dichiarati (CEO, consiglio esperti — CPO), mai
  // verificati documentalmente: non vanno confusi con `verified`.
  yearsOfExperience: z.number().int().min(0).max(80).optional(),
  certifications: z.string().max(500).optional(),
  hasLiabilityInsurance: z.boolean().default(false),
  // Preavviso per annullare (docs/CHANGELOG.md §347): non inviato = invariato.
  cancellationNoticeHours: z.union([z.literal(24), z.literal(48), z.literal(72)]).optional(),
});
export type ProfessionalProfileInput = z.infer<typeof professionalProfileSchema>;

/**
 * Creazione/aggiornamento del proprio profilo professionista (userId preso
 * dal JWT, non dal body). lat/lng sono opzionali: se non inviate, il backend
 * le ricava dal comune scelto (`findComuneByName`, dataset ISTAT in
 * packages/shared) — geocodifica reale, non più un placeholder 0,0.
 */
export const professionalProfileSelfSchema = professionalProfileSchema
  .omit({ userId: true, latitude: true, longitude: true })
  .extend({
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    // Dichiarazione di responsabilità sul profilo (docs/CHANGELOG.md §158):
    // obbligatoria al primo salvataggio e quando cambia la versione del
    // testo, poi confermata implicitamente a ogni salvataggio.
    profileDeclarationAccepted: z.boolean().optional(),
  });

/**
 * Versione e testo della dichiarazione che il professionista accetta salvando
 * il profilo (docs/CHANGELOG.md §158, testo proposto dal consiglio legale, da
 * far validare a un avvocato — checklist pre-lancio 11bis). Cambiando il
 * testo va cambiata la versione: il professionista la riconferma al primo
 * salvataggio successivo. Stesso schema di FISCAL_DECLARATION_VERSION.
 */
export const PROFILE_DECLARATION_VERSION = "2026-09-28";
export const PROFILE_DECLARATION_TEXT =
  "Dichiaro che i dati del mio profilo (qualifiche, certificazioni, assicurazione RC, prezzi) sono veri e aggiornati e che ho i requisiti di legge per i lavori che offro. Sono l'unico responsabile dei lavori che svolgo e mi impegno ad aggiornare i dati. Contenuti falsi possono essere rimossi e il profilo sospeso, come previsto dai Termini di servizio.";
export type ProfessionalProfileSelfInput = z.infer<typeof professionalProfileSelfSchema>;

/**
 * Fascia oraria, vedi packages/shared/src/availability.ts. `date`
 * opzionale: se presente, la fascia vale SOLO per quella data esatta (nuovo
 * comportamento di default, richiesta esplicita dell'utente); se assente,
 * ricorrenza settimanale indefinita per `dayOfWeek` — comportamento storico,
 * non più creabile dalla UI ma ancora supportato per le fasce già esistenti.
 */
export const availabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
    /**
     * Tipo/i di intervento accettati (richiesta esplicita dell'utente: due
     * caselle "A domicilio"/"Online", almeno una obbligatoria), con
     * capienza indipendente per tipo — 1 (esatta) o >1 (generica, richiede
     * preventivo invece di prenotazione istantanea). `*MaxBookings`
     * valorizzato solo quando il rispettivo `allows*` è vero.
     */
    allowsHome: z.boolean().default(true),
    allowsOnline: z.boolean().default(false),
    homeMaxBookings: z.number().int().min(1).max(20).optional(),
    onlineMaxBookings: z.number().int().min(1).max(20).optional(),
    date: isoDateSchema.optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "L'orario di fine deve essere dopo l'orario di inizio.",
    path: ["endTime"],
  })
  .refine((data) => data.allowsHome || data.allowsOnline, {
    message: "Seleziona almeno una modalità (a domicilio o online).",
    path: ["allowsHome"],
  });
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;

/** True se due fasce potrebbero applicarsi nella stessa data di calendario (usata per il controllo di sovrapposizione). */
function slotsShareAnOccurrence(a: AvailabilitySlotInput, b: AvailabilitySlotInput): boolean {
  if (a.date && b.date) return a.date === b.date;
  if (a.date && !b.date) return new Date(`${a.date}T00:00:00.000Z`).getUTCDay() === b.dayOfWeek;
  if (!a.date && b.date) return new Date(`${b.date}T00:00:00.000Z`).getUTCDay() === a.dayOfWeek;
  return a.dayOfWeek === b.dayOfWeek;
}

export const professionalAvailabilitySchema = z
  .object({
    slots: z.array(availabilitySlotSchema).max(200).default([]),
  })
  // Due fasce non possono sovrapporsi se potrebbero cadere nella stessa
  // data (es. due fasce dello stesso giorno esatto, o una fascia esatta e
  // una ricorrente sullo stesso giorno della settimana): fonte di verità
  // unica condivisa da client (validazione immediata in /dashboard/agenda)
  // e server (ZodValidationPipe), invece di duplicare la stessa logica in
  // due punti che potrebbero disallinearsi.
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.slots.length; i++) {
      for (let j = i + 1; j < data.slots.length; j++) {
        const a = data.slots[i]!;
        const b = data.slots[j]!;
        if (!slotsShareAnOccurrence(a, b)) continue;
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          ctx.addIssue({
            code: "custom",
            message: "Due fasce orarie non possono sovrapporsi nello stesso giorno.",
            path: ["slots"],
          });
          return;
        }
      }
    }
  });
export type ProfessionalAvailabilityInput = z.infer<typeof professionalAvailabilitySchema>;

/** Giorno di chiusura straordinaria (ferie, festività, imprevisto), vedi packages/shared/src/availability.ts. */
export const availabilityExceptionSchema = z.object({
  date: isoDateSchema,
});
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionSchema>;

/** Prenotazione diretta di una fascia esatta (maxBookings=1) dell'agenda pubblica. */
export const bookAgendaSlotSchema = z.object({
  date: isoDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
});
export type BookAgendaSlotInput = z.infer<typeof bookAgendaSlotSchema>;

/**
 * Promozione ad ADMIN dell'account con questa email, protetta da un segreto
 * condiviso (`ADMIN_BOOTSTRAP_SECRET`, solo variabile d'ambiente su
 * apps/api, mai committato) invece che da un JWT: serve proprio a creare il
 * PRIMO admin, quando nessun account ha ancora quel ruolo per poter passare
 * dal normale AdminGuard (che richiede di essere già ADMIN).
 */
export const adminBootstrapSchema = z.object({
  email: z.string().email(),
  secret: z.string().min(1),
});
export type AdminBootstrapInput = z.infer<typeof adminBootstrapSchema>;

/**
 * Codice della verifica in due passaggi dell'area admin (docs/CHANGELOG.md
 * §359): le 6 cifre dell'app o quelle ricevute per email se si è perso il telefono.
 */
export const adminTwoFactorCodeSchema = z.object({
  code: z.string().trim().min(6, "Scrivi il codice di 6 cifre.").max(20),
});
export type AdminTwoFactorCodeInput = z.infer<typeof adminTwoFactorCodeSchema>;

/**
 * Segnalazione di un contenuto (richiesta esplicita dell'utente, "Verbale di
 * Conformità" — meccanismo di notice-and-action, Reg. (UE) 2022/2065 art.
 * 16): un profilo professionista, una recensione del cliente o una
 * recensione del professionista sul cliente.
 */
// GUIDED_REQUEST: una richiesta ricevuta, segnalata dal professionista che
// l'ha ricevuta (menu hamburger di /dashboard/richieste, CHANGELOG §130).
export const contentReportTargetTypes = ["PROFESSIONAL_PROFILE", "REVIEW", "GUIDED_REQUEST"] as const;
export type ContentReportTargetType = (typeof contentReportTargetTypes)[number];
// Motivo scelto da un elenco fisso (docs/CHANGELOG.md §319): dice se il
// contenuto è segnalato come illegale. In quel caso servono la spiegazione
// e la dichiarazione di buona fede (DSA art. 16 c. 2 lett. a, d).
export const createContentReportSchema = z
  .object({
    targetType: z.enum(contentReportTargetTypes),
    targetId: z.string().min(1),
    reason: z.enum(contentReportReasonCodes, { message: "Indica il motivo della segnalazione." }),
    details: z.string().trim().max(1000).optional(),
    goodFaith: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!contentReportReason(data.reason)?.illegal) return;
    if (!data.details || data.details.length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "Spiega in poche parole perché è illegale." });
    }
    if (data.goodFaith !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["goodFaith"], message: "Conferma che la segnalazione è fatta in buona fede." });
    }
  });
export type CreateContentReportInput = z.infer<typeof createContentReportSchema>;

export const resolveContentReportSchema = z
  .object({
    status: z.enum(["RESOLVED", "DISMISSED"]),
    // Misura presa (docs/CHANGELOG.md §144): obbligatoria per RESOLVED, deve
    // essere compatibile col tipo segnalato (`MODERATION_ACTIONS_BY_TARGET`,
    // verificato dal server che conosce il tipo).
    action: z.enum(["WARN", "REQUEST_CORRECTION", "HIDE_CONTENT", "SUSPEND_PROFILE", "SUSPEND_USER"]).optional(),
    // Motivazione scritta della decisione (DSA art. 16/17, "statement of
    // reasons"): obbligatoria solo per RESOLVED — è il testo che verrà
    // comunicato a chi ha scritto il contenuto segnalato; per DISMISSED
    // (nessuna azione presa) resta facoltativa.
    resolutionNote: z.string().trim().max(2000).optional(),
    // Legge o punto dei Termini su cui si basa la misura (DSA art. 17 c. 3
    // lett. d-e, docs/CHANGELOG.md §319): obbligatorio per RESOLVED.
    ground: z.enum(moderationGroundCodes).optional(),
    // L'admin ha avvisato le autorità (DSA art. 18).
    authoritiesNotified: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "RESOLVED" && !data.resolutionNote) {
      ctx.addIssue({
        code: "custom",
        path: ["resolutionNote"],
        message: "Indica il motivo della decisione prima di risolvere la segnalazione.",
      });
    }
    if (data.status === "RESOLVED" && !data.action) {
      ctx.addIssue({ code: "custom", path: ["action"], message: "Scegli la misura da applicare." });
    }
    if (data.status === "RESOLVED" && !data.ground) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ground"], message: "Scegli la regola o la legge violata." });
    }
  });
export type ResolveContentReportInput = z.infer<typeof resolveContentReportSchema>;

/**
 * "Nascondi la recensione" e "Togli dalla ricerca" dalla scheda della persona
 * in Admin (docs/changelog/2026-10-30-admin-persone.md): stessa decisione di
 * una segnalazione, con il motivo, la regola o legge e la spiegazione per
 * l'autore, che la riceve per email.
 */
export const adminModerateSchema = z.object({
  targetType: z.enum(["REVIEW", "PROFESSIONAL_PROFILE"]),
  targetId: z.string().uuid(),
  reason: z.enum(contentReportReasonCodes),
  ground: z.enum(moderationGroundCodes),
  note: z.string().trim().min(10, "Spiega all'autore cosa non va, in almeno una frase.").max(2000),
});
export type AdminModerateInput = z.infer<typeof adminModerateSchema>;

/** "Annulla misura" (ricorso accolto o errore) e "Respingi ricorso": motivazione obbligatoria. */
export const contentReportDecisionNoteSchema = z.object({
  note: z.string().trim().min(3, "Scrivi la motivazione.").max(2000),
});
export type ContentReportDecisionNoteInput = z.infer<typeof contentReportDecisionNoteSchema>;

/** Contestazione dell'autore del contenuto (reclamo interno, DSA art. 20). */
export const contentReportAppealSchema = z.object({
  text: z.string().trim().min(10, "Spiega in almeno 10 caratteri perché contesti la decisione.").max(2000),
});
export type ContentReportAppealInput = z.infer<typeof contentReportAppealSchema>;

// ---------------------------------------------------------------------------
// MANOVIA — dati fiscali professionista, pagamenti lavoro, commissioni,
// DAC7, rimborsi, contestazioni (CLAUDE.md §88).
// ---------------------------------------------------------------------------

// Tre categorie, non due — richiesta esplicita dell'utente: "Privato"
// (persona fisica senza P.IVA), "Professionista" (persona fisica CON
// P.IVA — libero professionista/ditta individuale, non una società a sé),
// "Azienda" (impresa/società con personalità giuridica propria). Stesso
// principio già seguito ovunque nello schema Prisma: PRIVATE_INDIVIDUAL e
// SOLE_PROPRIETOR sono entrambe persone fisiche, la UI le distingue solo
// per i campi che richiede (P.IVA/REA solo per SOLE_PROPRIETOR).
export const professionalEntityTypes = ["PRIVATE_INDIVIDUAL", "SOLE_PROPRIETOR", "BUSINESS"] as const;
export type ProfessionalEntityTypeValue = (typeof professionalEntityTypes)[number];

/**
 * Versione della dichiarazione fiscale mostrata al salvataggio di
 * /dashboard/fiscale ("salvando i dati dichiaro che le informazioni
 * fornite sono corrette e che svolgo l'attività indicata sulla
 * piattaforma nel rispetto degli obblighi fiscali applicabili alla mia
 * situazione") — stesso pattern di `LEGAL_CONSENT_VERSION` sopra: una
 * versione futura del testo richiederebbe una nuova accettazione, mai
 * retroattiva sui professionisti che hanno già accettato quella corrente.
 */
export const FISCAL_DECLARATION_VERSION = "2026-09-16";

/**
 * Aggiornamento del profilo fiscale — tutti i campi facoltativi (nessun
 * dato è mai obbligatorio a livello di schema: la specifica lascia
 * esplicitamente aperto se un professionista debba avere per forza la
 * P.IVA, "il software non deve mai decidere se una persona ha bisogno di
 * una partita IVA"), la UI guida quali campi mostrare in base a
 * `entityType`. `representative` presente solo per un'impresa/società.
 * `fiscalDeclarationAccepted` (mai `false` inviato: o assente, o `true` —
 * stesso principio di `representative` sopra, un campo "evento" non un
 * valore da poter azzerare per errore) fa scattare la marcatura
 * server-side di `fiscalDeclarationAcceptedAt`/`Version`.
 */
export const professionalFiscalProfileSchema = z.object({
  entityType: z.enum(professionalEntityTypes).optional(),
  fiscalDeclarationAccepted: z.boolean().optional(),
  fiscalFirstName: z.string().max(80).optional(),
  fiscalLastName: z.string().max(80).optional(),
  fiscalCodiceFiscale: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().max(120).optional(),
  countryOfBirth: z.string().max(2).optional(),
  businessName: z.string().max(200).optional(),
  legalForm: z.string().max(100).optional(),
  vatNumber: z.string().max(20).optional(),
  businessRegistrationNumber: z.string().max(50).optional(),
  leiCode: z.string().max(20).optional(),
  additionalEuStates: z.array(z.string().max(2)).max(26).optional(),
  taxResidenceCountry: z.string().max(2).optional(),
  foreignTin: z.string().max(50).optional(),
  fiscalIdIssuingCountry: z.string().max(2).optional(),
  registeredStreet: z.string().max(200).optional(),
  registeredHouseNumber: z.string().max(20).optional(),
  registeredCity: z.string().max(120).optional(),
  registeredPostalCode: z.string().max(12).optional(),
  registeredProvince: z.string().max(50).optional(),
  registeredCountry: z.string().max(2).optional(),
  /** Applica l'IVA nelle sue fatture: lo dice solo chi ha la P.IVA come persona (docs/CHANGELOG.md §378). */
  chargesVat: z.boolean().optional(),
  /** Codice destinatario o PEC per ricevere le nostre fatture, facoltativo: vuoto lo cancella. */
  invoiceRecipient: z.string().trim().max(254).optional(),
  representative: z
    .object({
      firstName: z.string().min(1, "Nome obbligatorio."),
      lastName: z.string().min(1, "Cognome obbligatorio."),
      codiceFiscale: z.string().max(20).optional(),
      role: z.string().max(100).optional(),
    })
    .optional(),
});
export type ProfessionalFiscalProfileInput = z.infer<typeof professionalFiscalProfileSchema>;

export const fiscalVerificationStatuses = ["UNVERIFIED", "PENDING_VERIFICATION", "VERIFIED", "REJECTED", "REQUIRES_UPDATE"] as const;
export const setFiscalVerificationSchema = z.object({
  status: z.enum(fiscalVerificationStatuses),
  note: z.string().max(500).optional(),
});
export type SetFiscalVerificationInput = z.infer<typeof setFiscalVerificationSchema>;

export const requestRefundSchema = z.object({
  amountEurCents: z.number().int().positive("L'importo deve essere maggiore di zero."),
  reason: z.string().max(500).optional(),
});
export type RequestRefundInput = z.infer<typeof requestRefundSchema>;

export const decideRefundSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});
export type DecideRefundInput = z.infer<typeof decideRefundSchema>;

export const openDisputeSchema = z.object({
  reason: z.string().min(3, "Indica il motivo della contestazione.").max(500),
});
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;

export const resolveDisputeSchema = z.object({
  status: z.enum(["RESOLVED_CLIENT", "RESOLVED_PROFESSIONAL", "CLOSED"]),
  resolutionNote: z.string().max(1000).optional(),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

export const createFeeRuleSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio."),
  percentageBasisPoints: z.number().int().min(0).max(10_000),
  fixedFeeEurCents: z.number().int().min(0).default(0),
  minFeeEurCents: z.number().int().min(0).optional(),
  maxFeeEurCents: z.number().int().min(0).optional(),
  categoryId: z.string().optional(),
  professionalProfileId: z.string().optional(),
  effectiveFrom: z.string().optional(),
});
export type CreateFeeRuleInput = z.infer<typeof createFeeRuleSchema>;

export const setDac7RuleSchema = z.object({
  includeDirectPayments: z.boolean(),
});
export type SetDac7RuleInput = z.infer<typeof setDac7RuleSchema>;

/**
 * Identità della piattaforma richiesta dal blocco MessageSpec/Platform
 * dello schema OECD DPI usato da DAC7 (SendingEntityIN, PlatformName,
 * PlatformID) — tutti facoltativi a livello di schema (nessuna riga esiste
 * finché un admin non la compila, stesso principio "mai un dato
 * obbligatorio a livello di schema" già seguito per il resto della
 * specifica MANOVIA), ma senza di essi `generateExport` non può costruire
 * un MessageRefId valido — segnalato esplicitamente in UI, non bloccato
 * silenziosamente.
 */
export const platformDac7SettingsSchema = z.object({
  sendingEntityIn: z.string().max(30).optional(),
  platformName: z.string().max(200).optional(),
  platformIdValue: z.string().max(50).optional(),
  platformIdType: z.string().max(20).optional(),
  transmittingCountry: z.string().max(2).optional(),
  receivingCountry: z.string().max(2).optional(),
});
export type PlatformDac7SettingsInput = z.infer<typeof platformDac7SettingsSchema>;

/**
 * Stato personale di una scheda richiesta (menu hamburger di
 * /le-mie-richieste e /dashboard/richieste, CHANGELOG §130): ogni campo è
 * facoltativo, si invia solo quello che cambia. `markedUnread: false`
 * segna anche come lette le notifiche di quella richiesta.
 */
export const guidedRequestUserStateSchema = z
  .object({
    archived: z.boolean().optional(),
    muted: z.boolean().optional(),
    markedUnread: z.boolean().optional(),
    /** ISO datetime futuro (entro 60 giorni) per programmare il promemoria, `null` per annullarlo. */
    remindAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "Nessuna modifica indicata." });
export type GuidedRequestUserStateInput = z.infer<typeof guidedRequestUserStateSchema>;

/** Periodo delle statistiche del professionista (docs/CHANGELOG.md §149). */
export const professionalStatsQuerySchema = z
  .object({
    from: z.string().date("Data di inizio non valida"),
    to: z.string().date("Data di fine non valida"),
  })
  .refine((q) => q.from <= q.to, { message: "La data di inizio deve precedere quella di fine.", path: ["from"] });
export type ProfessionalStatsQuery = z.infer<typeof professionalStatsQuerySchema>;
