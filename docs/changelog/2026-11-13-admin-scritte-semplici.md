# Admin: scritte che capisce anche un bambino, numeri sotto "Vedi i numeri"

**Richiesta** (Luca, 13/11/2026, thread "Automatizzare l'admin e semplificare
le scritte"): le scritte dell'Admin devono capirle tutti; i dati che a una
persona normale non servono vanno tolti o nascosti. Proposta in
`analisi/admin-automatico/proposta.md` (cartella condivisa), parte 1
approvata da Luca.

**Decisione**
- Niente sigle né nomi di servizi esterni nei testi dell'Admin: SdI, XML,
  CSV, Stripe, Render, Openapi, Didit, VIES, nomi delle chiavi, "ricorso",
  "misura", "aggregazione", "quadratura", "IA". Al loro posto parole semplici
  ("Agenzia delle Entrate", "Scarica in Excel", "chiede di rivedere la
  decisione", "conseguenza", "controllo dei conti"). DAC7 resta solo tra
  parentesi dopo le parole semplici.
- I dettagli tecnici vanno in `TechNote` ("Per il tecnico"), chiuso e visibile
  solo al super admin; i consigli possono avere un `techNote`.
- In Andamento restano in vista i consigli e il numero guida; tutto il resto
  sotto "Vedi tutti i numeri". In Professionisti e ricerche restano i numeri
  grandi, le tabelle sotto "Vedi i numeri". In Entrate visite e notifiche
  spente sotto "Vedi i numeri" (`ShowNumbers`).
- Il controllo `apps/web/scripts/controlla-scritte-admin.mjs` (in `pnpm
  lint`) blocca le parole vietate nei testi visibili dell'Admin e nei testi
  per l'admin dell'API; eccezioni dentro `<TechNote>` o con il commento
  `scritte-admin: ok`.

**Motivo**: chi gestisce il sito deve capire subito cosa succede e cosa
fare, senza conoscere i servizi che usiamo.

**Verifica**: typecheck di sito e API, `pnpm lint` del sito, prove dell'API
(admin, proposte) e di shared, prove nel browser admin-da-fare,
admin-dopo-misura, andamento-sito, segnalazioni, admin-persone,
admin-proposte, admin-protezioni, admin-due-passaggi, prestazioni-problema.
