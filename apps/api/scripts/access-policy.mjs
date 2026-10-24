// Chi può usare ogni rotta dell'API (test dei permessi, docs/CHANGELOG.md §295).
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

const BOTH = ["clientA", "proA"];
const STRANGERS = ["clientB", "proB"];

const publicRoutes = [
  "GET /address/place/:id",
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
  "GET /calendar/:file",
  "GET /categories",
  "GET /categories/popular",
  "POST /contact",
  "GET /general-requests/availability",
  "GET /health",
  "GET /health/features",
  "POST /identity-verification/webhook",
  "GET /maps/static",
  "GET /professionals/:id",
  "GET /professionals/:id/agenda",
  "POST /professionals/:id/views",
  "GET /professionals/languages/popular",
  "GET /professionals/search",
  "GET /professionals/services/price-index",
  "GET /reviews/recent",
  "GET /stats/platform",
  "POST /waitlist",
];

const selfAny = [
  "POST /auth/change-password",
  "POST /auth/logout-others",
  "DELETE /auth/me",
  "GET /auth/me",
  "PATCH /auth/me",
  "GET /auth/me/export",
  "POST /auth/me/image",
  "POST /auth/verify-email/code",
  "POST /auth/verify-email/resend",
  "POST /bookings/completion-photos",
  "GET /bookings/me",
  "POST /guided-requests",
  "GET /guided-requests/chat-threads",
  "GET /guided-requests/me",
  "POST /guided-requests/photos",
  "POST /guided-requests/timeline-photos",
  // Scarica un allegato della chat dal nostro Cloudinary: l'indirizzo è già
  // pubblico sulla CDN, la rotta aggiunge solo il nome del file.
  "GET /guided-requests/timeline-photos/download",
  "DELETE /notifications",
  "GET /notifications/history",
  "POST /notifications/mark-all-read",
  "GET /notifications/preferences",
  "PUT /notifications/preferences",
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
  "GET /agenda/route",
  "GET /agenda/weather",
  "GET /agenda/week-template",
  "PUT /agenda/week-template",
  "GET /agenda/zone-demand",
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
  "GET /bookings/:id/job-payment": booking(),
  "POST /bookings/:id/job-payment/checkout/:part": booking({ params: (f) => ({ id: f.bookingA, part: "deposit" }) }),
  "POST /bookings/:id/job-payment/dispute": booking({ body: () => ({ reason: "Il lavoro non è stato svolto come concordato." }) }),
  "POST /bookings/:id/job-payment/refund": booking({ body: () => ({ reason: "Il lavoro non è stato svolto come concordato." }) }),
  "PATCH /bookings/:id/meeting-link": booking({ body: () => ({ meetingLink: "https://meet.google.com/abc-defg-hij" }) }),
  "PATCH /bookings/:id/note": booking({ body: () => ({ note: "Nota di prova" }) }),
  "POST /bookings/:id/on-the-way": booking(),
  "POST /bookings/:id/professional-problem": booking({ body: () => ({ type: "CLIENT_ABSENT", description: "Il cliente non era in casa." }) }),
  "PATCH /bookings/:id/reopen": booking(),
  "PATCH /bookings/:id/report-no-show": booking(),
  "PATCH /bookings/:id/status": booking({ body: () => ({ status: "CANCELED" }) }),
  "POST /bookings/from-quote/:quoteId": { kind: "owned", owners: ["clientA"], params: (f) => ({ quoteId: f.quoteA }) },

  "DELETE /external-jobs/:id": externalJob,
  "PATCH /external-jobs/:id": externalJob,
  "PATCH /external-jobs/:id/status": { ...externalJob, body: () => ({ status: "COMPLETED" }) },

  "PATCH /guided-requests/:id": request({ body: () => ({ description: "Descrizione modificata da un estraneo" }) }),
  "DELETE /guided-requests/:id": request(),
  "DELETE /guided-requests/:id/permanent": request(),
  // Stato personale (archiviata, silenziata): del cliente e dei professionisti che l'hanno ricevuta.
  "PATCH /guided-requests/:id/my-state": request({ owners: BOTH, body: () => ({ archived: true }) }),
  "GET /guided-requests/:id/status": request(),
  "GET /guided-requests/:id/timeline": request({ owners: BOTH, query: (f) => ({ professionalProfileId: f.profileA }) }),
  "POST /guided-requests/:id/timeline": request({
    owners: BOTH,
    body: (f, actor) => ({ professionalProfileId: actor === "proB" ? f.profileB : f.profileA, message: "Messaggio da un estraneo" }),
  }),

  "DELETE /notifications/:id": { kind: "owned", owners: ["clientA"], params: (f) => ({ id: f.notificationA }) },

  "DELETE /professionals/me/leads/:id": lead,
  "PATCH /professionals/me/leads/:id/decline": lead,
  "PATCH /professionals/me/leads/:id/note": { ...lead, body: () => ({ note: "Nota" }) },

  "POST /quotes": { kind: "owned", owners: ["proA"], strangers: ["proB"], body: (f) => quoteBody(f) },
  "POST /quotes/:id/confirm-proposed-date": quote({ owners: ["proA"] }),
  "POST /quotes/:id/counter-propose-date": quote({ owners: ["proA"] }),
  "POST /quotes/:id/propose-date": quote(),
  "POST /quotes/:id/reject": quote({ body: () => ({ note: "No grazie" }) }),
  "POST /quotes/:id/reject-proposed-date": quote({ owners: ["proA"] }),
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

export const POLICY = {
  ...Object.fromEntries(publicRoutes.map((key) => [key, { kind: "public" }])),
  "SSE /realtime/stream": { kind: "ticket" },
  ...Object.fromEntries(selfAny.map((key) => [key, { kind: "self" }])),
  ...Object.fromEntries(selfProfessional.map((key) => [key, { kind: "self", role: "professional" }])),
  ...owned,
};

export const DEFAULT_STRANGERS = STRANGERS;
