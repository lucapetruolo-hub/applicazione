# Foto cancellate da Cloudinary alla chiusura dell'account

**Richiesta**: dalle prove del 25/11 (`2026-11-25-parti-lasciate-fuori-sicurezza.md`)
è venuto fuori che alla chiusura dell'account il collegamento alle foto si
toglieva dal database, ma il file restava su Cloudinary a un indirizzo
pubblico. Luca ha detto "sì" a cancellarle (26/11). Ha detto "no" all'elenco
delle password comuni.

**Decisione e motivo** (GDPR art. 17, diritto alla cancellazione):

- Alla chiusura (`AuthService.deleteAccount`) si cancellano da Cloudinary:
  - la foto dell'account;
  - per un professionista, foto del profilo, copertina e foto dei lavori fatti
    (tolte anche dal database);
  - per un cliente, foto e video delle richieste che **non** sono diventate un
    lavoro (tolti anche dal database).
- Restano le foto legate a un lavoro: chiusura del lavoro, recensioni, chat,
  segnalazioni e contestazioni. Servono per le contestazioni e i rimborsi.
  Per quanto tempo tenerle è la domanda A40 per l'avvocato.
- Si cancellano solo i file del nostro Cloudinary (`ownCloudinaryMedia`). Le
  copertine pronte del sito e i documenti della chat non si toccano.
- Una chiamata ogni 100 file per tipo (`deleteOwnMedia`,
  `cloudinary.api.delete_resources`). Se Cloudinary non risponde, la chiusura
  va avanti comunque e l'errore va nel registro.

**Verifica**: `account-closure-media.test.ts` e le prove nuove in
`cloudinary-documents.test.ts` (solo il nostro Cloudinary, foto e video
separati, un errore di Cloudinary non ferma nulla). La query delle richieste
senza lavoro è provata su un Postgres locale. Typecheck e lint dell'API sono
verdi.
