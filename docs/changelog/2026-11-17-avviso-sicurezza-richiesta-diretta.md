# Avviso di sicurezza piccolo, anche nella richiesta a professionisti scelti

**Richiesta** (Luca, 17/11/2026, thread "Togliere l'IA dalla richiesta a un
professionista scelto"): "quando si invia una richiesta preventivo ad un
professionista specifico o anche più professionisti, non c'è bisogno della
ricerca dell'IA né del dizionario e neanche della ricerca IA della foto". Poi:
"l'avviso di sicurezza potremo metterlo più piccolo in modo che non occupa
molto spazio".

**Cosa c'era già**: con un professionista scelto (`professionista`) o con 2-5
scelti (`scelti`) il modulo non suggerisce mestieri, non chiama
`POST /problem-match` e non manda la foto all'IA (`suggestionsOn` falso dal
3/11). Ma insieme ai mestieri spariva anche l'avviso di sicurezza: chi scriveva
"sento odore di gas" a un idraulico scelto non vedeva cosa fare.

**Decisione**:
- Il dizionario gira sempre nel browser (gratis, nessuna chiamata) solo per
  l'avviso di sicurezza; mestieri suggeriti e IA restano solo nella richiesta
  generale. Nessuna chiamata all'IA in più.
- Nel modulo di richiesta l'avviso è piccolo: il pericolo in grassetto
  ("Odore di gas?") e cosa fare subito in una o due righe, poi "Tutti i passi"
  che apre l'elenco completo. Riassunti in `title`/`short` di
  `PROBLEM_SAFETY_TEXTS`, presi dagli stessi passi già scritti dalle fonti
  ufficiali (da rileggere con l'avvocato insieme agli altri testi di
  sicurezza). Vale per tutte le richieste del modulo, anche quelle generali.
- Nella banda dei risultati della ricerca l'avviso resta grande: lì arriva per
  primo, prima di scegliere chi chiamare.

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts` ("odore di gas a un
professionista scelto"): avviso visibile, passi chiusi finché non si tocca
"Tutti i passi", nessuna chiamata a `/problem-match`, nessun "Chi ti serve".
Foto prima/dopo da telefono e computer in project-files
`anteprime/avviso-sicurezza/`.
