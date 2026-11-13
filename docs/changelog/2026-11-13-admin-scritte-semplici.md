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

## Secondo giro: leggibilità misurata (versione profonda)

**Richiesta**: Luca ha approvato il "piano nuovo" di
`analisi/admin-automazione-versione-profonda.md`: scritte misurate, non
giudicate.

**Decisione**
- `controlla-scritte-admin.mjs` misura ogni frase di almeno 8 parole delle
  pagine admin con l'indice Gulpease (la misura di leggibilità per
  l'italiano) e blocca quelle sotto 60, difficili anche con la licenza media.
- Riscritte le 75 frasi che erano sotto 60 (la peggiore era a 36, la
  spiegazione degli account sospetti): frasi più corte, parole più brevi.
  Restano fuori, con il commento `scritte-admin: ok`, solo i nomi delle app di
  autenticazione e la pagina del primo accesso admin.
- Misura a parte, non bloccante, con il Nuovo vocabolario di base di De
  Mauro: circa 9 parole su 10 dell'Admin sono comuni; le altre sono quasi
  tutte parole del sito (account, email, segnalazione, contestazione).

**Verifica**: `pnpm lint` e typecheck del sito, prove nel browser delle
pagine admin (25 prove, telefono; admin-dopo-misura anche da computer).
