# Una richiesta archiviata con una novità torna in "Tutte"

**Richiesta** (Luca, 10/11/2026, dopo #307): "quando una richiesta archiviata
ha aggiornamenti, spostala su tutte a meno che non sia silenziata". E fare la
miglioria proposta: un testo proprio per la scheda "Archiviate" vuota.

**Decisione**:
- Ogni notifica che riguarda una richiesta (preventivo nuovo, messaggio,
  data proposta, appuntamento, promemoria…) la toglie dall'archivio di chi la
  riceve, se non l'ha silenziata. Un unico punto: `NotificationsService.notify`
  (`bringBackFromArchive`), così vale per cliente e professionista e per ogni
  tipo di avviso di oggi e di domani. Tocca solo l'archivio di chi riceve la
  notifica, mai quello dell'altra parte.
- Silenziata = resta in "Archiviate": chi l'ha silenziata ha già detto che
  non vuole essere disturbato.
- Anche i promemoria ("Ricordamelo domani", "Ricordamelo tra…") la riportano
  in "Tutte": li ha chiesti l'utente, servono a ritrovarla.
- Mai bloccante: se togliere dall'archivio non riesce, la notifica parte lo
  stesso.
- "Archiviate" vuota ora dice "Nessuna richiesta archiviata · Le richieste
  che archivi finiscono qui. Tornano in Tutte quando hanno novità, se non le
  hai silenziate." invece di "Cambia filtro…", sulle due pagine.

**Verifica**: test dell'API in
`apps/api/src/guided-requests/guided-request-user-state.service.test.ts`
(novità, promemoria, silenziata, errore del database, notifica senza
richiesta); prova nel browser in `e2e/tests/richieste-archiviate.spec.ts`: due
richieste archiviate, una silenziata, il professionista manda un preventivo
su entrambe e solo quella non silenziata torna in "Tutte"; più il testo della
scheda vuota.
