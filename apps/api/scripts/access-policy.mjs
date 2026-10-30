// Chi può usare ogni rotta dell'API (test dei permessi, docs/CHANGELOG.md §312).
// Le rotte admin non stanno qui: il permesso lo dice `@RequireAdminScope` e il
// test lo prova con ogni ruolo. Una rotta nuova che manca da qui fa fallire la
// CI finché non viene classificata.
//
// Tipi:
// - public: nessun accesso richiesto (il test controlla che non abbia guard).
// - ticket: stream in tempo reale, solo con il biglietto (§293).
// - self: agisce solo sui dati di chi chiama, senza id di altri. `role:
//   "professional"` = un cliente non deve ottenere una risposta valida.
// - owned: contiene l'id di qualcosa che appartiene a qualcuno. Gli
//   "estranei" (di serie tutti gli utenti non proprietari) devono ricevere
//   403 o 404; nelle GET i proprietari devono ricevere una risposta valida.
//   `params`, `query` e `body` usano i dati di prova (`f`) creati dal test.
//   `ownerPassesCheck`: per i proprietari basta superare il controllo (dopo
//   la rotta usa un servizio esterno spento nel test).
// - self con `role: "admin"`: verifica in due passaggi dell'admin (§359),
//   prima del codice e quindi senza AdminGuard. Clienti e professionisti
//   devono ricevere 403.

const BOTH = ["clientA", "proA"];
const STRANGERS = ["clientB", "proB"];

const publicRoutes = [
  "GET /address/place/:id",
  "GET /address/postal-code",
  "GET /address/postal-code/check",
  "GET /address/status",
  "GET /address/suggestions",
  "POST /admin/bootstrap",
  "POST /auth/email-status",
  "POST /auth/google/verify",
  "GET /auth/invite/:token",
  "POST /auth/invite/accept",
  "POST /auth/login",
  "POST /auth/password-reset/code",
  "POST /auth/password-reset/confirm",
  "POST /auth/password-reset/request",
  "POST /auth/register",
  "POST /auth/verify-email",
  "POST /billing/webhook",
  // Pulsanti "Ci sarò" e "Non posso più" dell'email del promemoria: link firmato, senza accedere (docs/changelog/2026-10-28-promemoria-whatsapp.md).
  "GET /booking-replies/:token",
  "POST /booking-replies/:token",
  "GET /calendar/:file",
  "GET /categories",
  "GET /categories/popular",
  "POST /contact",
  "GET /general-requests/availability",
  "GET /guided-requests/reach",
  "GET /health",
  "GET /health/features",
  "POST /identity-verification/webhook",
  // Webhook di WhatsApp (Meta): registrazione con il token e firma sul corpo (docs/changelog/2026-10-28-promemoria-whatsapp.md).
  "GET /whatsapp/webhook",
  "POST /whatsapp/webhook",
  "GET /maps/static",
  "POST /notifications/email-off",
  // Dal problema scritto ai mestieri (§392): dizionario, poi IA nei casi dubbi, con tetto giornaliero.
  "POST /problem-match",
  // Prestazioni standard aggiunte dall'admin (§388), mostrate in iscrizione e nel profilo.
  "GET /service-names/standard",
  "GET /professionals/:id",
  "GET /professionals/:id/agenda",
  "POST /professionals/:id/views",
  "GET /professionals/city-hints",
  // Conteggi dell'andamento del sito (§372): passi della richiesta e invii falliti, senza account.
  "POST /site/step",
  "POST /site/failure",
  // Profilo aperto, per dispositivo, dal lancio (§402).
  "POST /site/profile-view",
  // Passi dalle voci di "Quanto costa" (§399), senza account.
  "POST /site/price-tool",
  "GET /professionals/languages/popular",
  // Prezzi aggregati della pagina "Quanto costa", mai sotto le soglie (§296).
  "GET /professionals/prices/:category",
  "GET /professionals/search",
  "GET /professionals/services/price-index",
  "GET /reviews/recent",
  "GET /stats/platform",
  // Posti rimasti dell'offerta di lancio, solo due numeri (§363).
  "GET /subscriptions/founders",
  "POST /waitlist",
];

const selfAny = [
  // "Ce ne occupiamo noi" (§392): la richiesta di chi chiama.
  "POST /problem-match/takeover",
  "POST /auth/change-password",
  "POST /auth/logout-others",
  "DELETE /auth/me",
  "GET /auth/me",
  "PATCH /auth/me",
  "PATCH /auth/me/preferences",
  "GET /auth/me/export",
  "POST /auth/me/image",
  "POST /auth/verify-email/code",
  "POST /auth/verify-email/resend",
  "POST /bookings/completion-photos",
  "GET /bookings/me",
  // Ultimi dati per la fattura usati dal cliente, per precompilare (§378).
  "GET /client-invoice-requests/last",
  "POST /guided-requests",
  "GET /guided-requests/chat-threads",
  "GET /guided-requests/me",
  "POST /guided-requests/photos",
  "POST /guided-requests/timeline-photos",
  "DELETE /notifications",
  "GET /notifications/history",
  "POST /notifications/mark-all-read",
  "GET /notifications/preferences",
  "PUT /notifications/preferences",
  // Promemoria su WhatsApp: numero e interruttore di chi chiama.
  "GET /whatsapp/me",
  "POST /whatsapp/me/code",
  "POST /whatsapp/me/confirm",
  "POST /whatsapp/me/disable",
  "POST /whatsapp/me/enable",
  "GET /notifications/unread",
  "GET /notifications/unread-count",
  // Prenota la fascia di un professionista qualsiasi (pubblico): nessun dato altrui.
  "POST /professionals/:id/agenda/book",
  "POST /realtime/ticket",
  "POST /reports",
  "GET /reports/mine",
  "GET /reviews/me",
  "POST /reviews/photos",
  // Salvare un professionista pubblico non tocca dati di altri.
  "GET /saved-professionals/me",
  "POST /saved-professionals/:professionalProfileId",
  "DELETE /saved-professionals/:professionalProfileId",
];

const selfProfessional = [
  "DELETE /agenda/calendar-feed",
  "GET /agenda/calendar-feed",
  "POST /agenda/calendar-feed",
  "GET /agenda/days-ahead",
  "GET /agenda/route",
  "GET /agenda/weather",
  "GET /agenda/week-template",
  "PUT /agenda/week-template",
  "PUT /agenda/week-template/month",
  "POST /agenda/week-template/starter/keep",
  "GET /agenda/online-slots",
  "POST /agenda/online-slots/remove",
  "POST /agenda/online/enable",
  "GET /agenda/zone-demand",
  // Fatture e documenti del professionista (§378).
  "GET /documents",
  "PUT /documents/accountant",
  "POST /billing/boost/checkout",
  "POST /billing/portal",
  "POST /billing/subscription/cancel",
  "POST /billing/subscription/checkout",
  "POST /billing/subscription/resume",
  "POST /external-jobs",
  "GET /external-jobs/me",
  "GET /professionals/me",
  "PUT /professionals/me",
  "GET /professionals/me/availability",
  "PUT /professionals/me/availability",
  "POST /professionals/me/availability/exceptions",
  "DELETE /professionals/me/availability/exceptions/:date",
  "GET /professionals/me/available-slots",
  "GET /professionals/me/bookings",
  "GET /professionals/me/dac7",
  "PATCH /professionals/me/engagement-radius",
  "GET /professionals/me/fiscal-profile",
  "PUT /professionals/me/fiscal-profile",
  "POST /professionals/me/fiscal-profile/stripe-connect",
  "POST /professionals/me/fiscal-profile/stripe-dashboard",
  "POST /professionals/me/image",
  "GET /professionals/me/insights",
  "GET /professionals/me/leads",
  "GET /professionals/me/online-payments/summary",
  "GET /professionals/me/payout-iban",
  "PUT /professionals/me/payout-iban",
  "POST /professionals/me/portfolio-photos",
  "GET /professionals/me/preview",
  "GET /professionals/me/revenue-analytics",
  "GET /professionals/me/stats",
  "GET /professionals/me/subscription",
  "GET /professionals/me/verification",
  "POST /professionals/me/verification/identity",
];

const booking = (extra = {}) => ({ kind: "owned", owners: BOTH, params: (f) => ({ id: f.bookingA }), ...extra });
const request = (extra = {}) => ({ kind: "owned", owners: ["clientA"], params: (f) => ({ id: f.requestA }), ...extra });
const quote = (extra = {}) => ({ kind: "owned", owners: ["clientA"], params: (f) => ({ id: f.quoteA }), ...extra });
const lead = { kind: "owned", owners: ["proA"], params: (f) => ({ id: f.leadA }) };
const externalJob = { kind: "owned", owners: ["proA"], params: (f) => ({ id: f.externalJobA }) };
const invoice = { kind: "owned", owners: ["proA"], strangers: ["clientA", "clientB", "proB"], params: (f) => ({ id: f.invoiceA }) };
// Estratto di un mese: dati di chi chiama, il mese non è di nessuno.
const statement = { kind: "self", role: "professional", params: () => ({ month: "2026-09" }) };
// Copia del documento: solo a lavoro terminato (docs/changelog/2026-10-30-documenti-fiscali.md).
const courtesy = { kind: "owned", owners: ["proA"], strangers: ["clientA", "clientB", "proB"], params: (f) => ({ bookingId: f.bookingCompleted }) };

const owned = {
  "DELETE /bookings/:id": booking(),
  "PATCH /bookings/:id/cancel": booking(),
  "PATCH /bookings/:id/cancel-by-professional": booking({ body: () => ({ reason: "Imprevisto improvviso" }) }),
  "PATCH /bookings/:id/client-confirm-complete": booking(),
  "PATCH /bookings/:id/complete": booking(),
  "POST /bookings/:id/issue": booking({ body: () => ({ type: "NO_SHOW", description: "Il professionista non si è presentato." }) }),
  "POST /bookings/:id/issue/appeal": booking({ body: () => ({ text: "Non sono d'accordo con la decisione presa." }) }),
  "PATCH /bookings/:id/issue/chat-outcome": booking({ body: () => ({ outcome: "RESOLVED" }) }),
  "PATCH /bookings/:id/issue/info": booking({ body: () => ({ response: "Ecco le informazioni richieste." }) }),
  "POST /bookings/:id/issue/redispatch": booking(),
  "PATCH /bookings/:id/issue/response": booking({ body: () => ({ response: "Ecco la mia versione dei fatti." }) }),
  "GET /bookings/:id/calendar": booking({ owners: ["clientA"] }),
  "GET /bookings/:id/job-payment": booking(),
  "POST /bookings/:id/job-payment/checkout/:part": booking({ params: (f) => ({ id: f.bookingA, part: "deposit" }) }),
  "POST /bookings/:id/job-payment/dispute": booking({ body: () => ({ reason: "Il lavoro non è stato svolto come concordato." }) }),
  // Spiegazione sulla contestazione in banca: solo il professionista del lavoro.
  "PATCH /bookings/:id/job-payment/bank-dispute-note": booking({
    owners: ["proA"],
    strangers: ["clientA", "clientB", "proB"],
    body: () => ({ note: "Il lavoro è stato fatto il giorno concordato.", photoUrls: [] }),
  }),
  "POST /bookings/:id/job-payment/refund": booking({ body: () => ({ reason: "Il lavoro non è stato svolto come concordato." }) }),
  "PATCH /bookings/:id/meeting-link": booking({ body: () => ({ meetingLink: "https://meet.google.com/abc-defg-hij" }) }),
  "PATCH /bookings/:id/note": booking({ body: () => ({ note: "Nota di prova" }) }),
  "POST /bookings/:id/on-the-way": booking(),
  "POST /bookings/:id/professional-problem": booking({ body: () => ({ type: "CLIENT_ABSENT", description: "Il cliente non era in casa." }) }),
  "PATCH /bookings/:id/reopen": booking(),
  "PATCH /bookings/:id/report-no-show": booking(),
  "PATCH /bookings/:id/status": booking({ body: () => ({ status: "CANCELED" }) }),
  "POST /bookings/from-quote/:quoteId": { kind: "owned", owners: ["clientA"], params: (f) => ({ quoteId: f.quoteA }) },

  // Fattura chiesta dal cliente al professionista, sul lavoro accettato (§378).
  "PUT /client-invoice-requests/:quoteId": { kind: "owned", owners: ["clientA"], params: (f) => ({ quoteId: f.quoteDone }) },
  "DELETE /client-invoice-requests/:quoteId": { kind: "owned", owners: ["clientA"], params: (f) => ({ quoteId: f.quoteDone }) },

  // Le nostre fatture al professionista e la copia di cortesia del suo documento: solo lui (§378).
  "GET /documents/invoices/:id": invoice,
  "GET /documents/invoices/:id/xml": invoice,
  "GET /documents/invoices/:id/pdf": invoice,
  "GET /documents/courtesy/:bookingId": courtesy,
  // Documenti di un lavoro dal menu della richiesta: le due parti; la copia in PDF solo il cliente (§386).
  "GET /documents/jobs/:bookingId": { kind: "owned", owners: BOTH, params: (f) => ({ bookingId: f.bookingA }) },
  "GET /documents/jobs/:bookingId/copy/pdf": { kind: "owned", owners: ["clientA"], strangers: ["clientB", "proB", "proA"], params: (f) => ({ bookingId: f.bookingCompleted }) },
  "GET /documents/courtesy/:bookingId/pdf": courtesy,
  "PUT /documents/courtesy/:bookingId/details": { ...courtesy, body: () => ({ number: "1/A", date: "2026-10-01" }) },

  "DELETE /external-jobs/:id": externalJob,
  "PATCH /external-jobs/:id": externalJob,
  "PATCH /external-jobs/:id/status": { ...externalJob, body: () => ({ status: "COMPLETED" }) },

  "PATCH /guided-requests/:id": request({ body: () => ({ description: "Descrizione modificata da un estraneo" }) }),
  "DELETE /guided-requests/:id": request(),
  "POST /guided-requests/:id/restore": request(),
  // Stato personale (archiviata, silenziata): del cliente e dei professionisti che l'hanno ricevuta.
  "PATCH /guided-requests/:id/my-state": request({ owners: BOTH, body: () => ({ archived: true }) }),
  "GET /guided-requests/:id/status": request(),
  "GET /guided-requests/:id/timeline": request({ owners: BOTH, query: (f) => ({ professionalProfileId: f.profileA }) }),
  "POST /guided-requests/:id/timeline": request({
    owners: BOTH,
    body: (f, actor) => ({ professionalProfileId: actor === "proB" ? f.profileB : f.profileA, message: "Messaggio da un estraneo" }),
  }),

  // Allegato della chat: solo chi partecipa alla chat (o un admin, §313).
  "GET /guided-requests/timeline-photos/download": {
    kind: "owned",
    owners: BOTH,
    query: (f) => ({ url: f.attachmentUrl }),
    ownerPassesCheck: true,
  },

  "DELETE /notifications/:id": { kind: "owned", owners: ["clientA"], params: (f) => ({ id: f.notificationA }) },

  "DELETE /professionals/me/leads/:id": lead,
  "PATCH /professionals/me/leads/:id/decline": lead,
  "PATCH /professionals/me/leads/:id/note": { ...lead, body: () => ({ note: "Nota" }) },

  "POST /quotes": { kind: "owned", owners: ["proA"], strangers: ["proB"], body: (f) => quoteBody(f) },
  // Su un appuntamento fissato risponde anche il cliente, alla data proposta dal professionista.
  "POST /quotes/:id/confirm-proposed-date": quote({ owners: ["proA", "clientA"] }),
  "POST /quotes/:id/counter-propose-date": quote({ owners: ["proA"] }),
  "POST /quotes/:id/propose-date": quote(),
  "POST /quotes/:id/reject": quote({ body: () => ({ note: "No grazie" }) }),
  "POST /quotes/:id/reject-proposed-date": quote({ owners: ["proA", "clientA"] }),
  "POST /quotes/:id/withdraw": quote({ owners: ["proA"] }),

  // Ricorso contro una decisione: solo chi possiede il contenuto segnalato.
  "POST /reports/:id/appeal": {
    kind: "owned",
    owners: ["proA"],
    strangers: ["clientA", "clientB", "proB"],
    params: (f) => ({ id: f.reportA }),
    body: () => ({ text: "Contesto la decisione perché il contenuto era corretto." }),
  },
  "POST /reviews": { kind: "owned", owners: ["clientA"], body: (f) => ({ bookingId: f.bookingA, rating: 5, comment: "Recensione di un estraneo" }) },
};

function quoteBody(f) {
  const start = new Date(Date.now() + 7 * 86_400_000).toISOString();
  return { requestId: f.requestA, estimatedStartDate: start, items: [{ name: "Manodopera", priceMinEurCents: 5000, priceMaxEurCents: 8000 }] };
}

const selfAdmin = [
  "GET /admin/2fa",
  "POST /admin/2fa/enable",
  "POST /admin/2fa/reset-code",
  "POST /admin/2fa/reset-code/confirm",
  "POST /admin/2fa/setup",
  "POST /admin/2fa/verify",
];

export const POLICY = {
  ...Object.fromEntries(publicRoutes.map((key) => [key, { kind: "public" }])),
  "SSE /realtime/stream": { kind: "ticket" },
  ...Object.fromEntries(selfAny.map((key) => [key, { kind: "self" }])),
  ...Object.fromEntries(selfProfessional.map((key) => [key, { kind: "self", role: "professional" }])),
  ...Object.fromEntries(selfAdmin.map((key) => [key, { kind: "self", role: "admin" }])),
  "GET /documents/statements/:month": statement,
  "GET /documents/statements/:month/csv": statement,
  "GET /documents/statements/:month/pdf": statement,
  "GET /professionals/me/dac7/:year/pdf": { kind: "self", role: "professional", params: () => ({ year: "2026" }) },
  // Riepilogo dell'anno dei documenti dati ai clienti: dati di chi chiama (§382).
  "GET /documents/client-documents/:year/pdf": { kind: "self", role: "professional", params: () => ({ year: "2026" }) },
  "GET /documents/client-documents/:year/csv": { kind: "self", role: "professional", params: () => ({ year: "2026" }) },
  ...owned,
};

export const DEFAULT_STRANGERS = STRANGERS;
