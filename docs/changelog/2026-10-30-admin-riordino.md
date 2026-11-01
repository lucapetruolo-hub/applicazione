# Riordino dell'area Admin, parte 1: struttura e coda "Da fare"

**Richiesta** (Luca, 29-30/10/2026, thread "Riordinare l'area Admin"):
"la parte admin è incasinata, servirebbe meno grafica e più funzionalità e
ordine e logica". Poi la versione più profonda: partire dai compiti, non
dalle pagine; "Da fare" come coda unica ordinata per scadenza; tabelle
compatte con un solo stile; axe a 0 errori; misura prima e dopo con un agente
che non conosce il sito. Analisi completa in
`/mnt/project-files/analisi/admin-riordino/analisi-e-proposta.md` (inventario,
32 compiti, casi con scadenza, card sorting, tree test, misura prima).

**Decisione** (Luca ha scelto "Sì, tutte e 3" le PR; struttura a 8 voci
confermata il 30/10). Questa è la PR 1 di 3 (poi Persone e Protezioni):

- **Menu a 8 sezioni con schede** al posto di 21 voci in fila: Da fare,
  Persone, Reclami e segnalazioni, Richieste, Soldi, Fisco e fatture, Numeri,
  Impostazioni (`ADMIN_SECTIONS` in `apps/web/src/components/admin/AdminNav.tsx`).
  Gruppi dal card sorting: tutte e tre le persone simulate tenevano il fisco
  separato dai soldi, da qui 8 voci e non le 7 della prima bozza. Tree test:
  24 compiti su 24 trovati (oggi 23 su 24, con meno sicurezza). Gli indirizzi
  delle pagine non cambiano. Il numero rosso della sezione somma quelli delle
  schede. In cima a ogni pagina il titolo della sezione (h1) e le schede;
  i titoli delle pagine diventano h2.
- **"Da fare" è una coda sola** (`GET /admin/queue`,
  `apps/api/src/admin/admin-queue.service.ts`, tipi in
  `packages/shared/src/adminQueue.ts`): contestazioni in banca, problemi e
  ricorsi, rimborsi, contestazioni di pagamento, saldi non pagati, fatture
  scartate dallo SdI, segnalazioni e ricorsi, "Ce ne occupiamo noi", messaggi
  dal sito, verifiche, zone chiuse. Prima i pericoli (gas, monossido, il
  dizionario di `matchProblem`), poi la scadenza più vicina (anche già
  passata), poi il più vecchio. Ogni admin vede solo i tipi del suo ruolo.
  Filtri "Tipo" e "Chi se ne occupa" nell'indirizzo (`?tipo=`, `?chi=mie`).
  Sotto, "Da guardare, senza decisione": i problemi ancora in chat tra le
  parti.
- **"Prendo io" / "Lascia"** (`POST /admin/queue/claim` e `/release`, tabella
  `admin_case_claims`, migrazione `20261030120000_admin_casi_presi`): due
  admin non lavorano più lo stesso caso senza saperlo. Il caso preso resta
  in coda finché non è deciso nella sua pagina.
- **Avviso del mattino sui casi presi** (miglioria proposta e accolta da Luca
  il 30/10): ogni giorno alle 8 (ora di Roma) chi ha detto "Prendo io" su un
  caso che scade entro 24 ore, o è già scaduto, riceve un avviso in
  campanella ed email (`ADMIN_CLAIMED_CASES_DUE`, argomento "Avvisi per
  l'amministrazione", si spegne dalle Notifiche) con un link a "Presi da me".
  Lo stesso giro toglie i "presi" dei casi già chiusi e di chi non è più
  admin (`AdminQueueService.morningClaimedDue`).
- **Grafici e numeri della vecchia Home** in Numeri → Andamento e consigli
  (`AdminSummaryNumbers`); in "Da fare" il super admin vede solo il primo
  consiglio della settimana.
- **Fisco e fatture**: Finanza divisa in "Le nostre fatture" (riepilogo,
  fatture, regole di commissione) e "DAC7" (`/admin/finanza/dac7`).
- **Impostazioni**: nuove schede Amministratori (`/admin/amministratori`, gli
  admin con il ruolo) e Account di prova (`/admin/account-di-prova`), la
  stessa tabella di Utenti (`AdminUsersList`) con il filtro fisso.
- **Problemi** si apre sulla vista giusta con `?vista=appeals|chat` (solo la
  scheda iniziale, contenuto invariato: Problemi e Pagamenti li cambia il
  thread del gruppo 1).
- **Accessibilità**: le 24 pagine admin passano da 13 errori axe a 0. Le schede
  "Da gestire/Archivio" e i periodi di Entrate in verde pieno (#128552, il
  bianco sul verde chiaro si fermava a 3,6:1), il grigio di "spenta di serie"
  più scuro, e `Field` di `packages/ui` dà al campo il nome della sua
  etichetta (`aria-label`): vale per tutti i moduli del sito che lo usano,
  prima il lettore di schermo leggeva "campo di testo" senza nome.

**Verifica**: prova dell'email in `email-templates.test.ts`; avviso del
mattino provato in locale (contestazione in banca presa che scade fra 5 ore →
una notifica "scade oggi alle 19:57"; un "preso" su un caso inesistente
tolto). `e2e/tests/admin-da-fare.spec.ts` (telefono e computer: gas in
cima anche se più nuovo di un messaggio, "Prendo io" che resta dopo il
ricaricamento con "Presi da me", "Lascia", nessuna riga più larga dello
schermo, axe a 0, menu → Fisco e fatture → DAC7). Riprovate le prove admin
esistenti (segnalazioni, andamento, due passaggi, menu laterale, conteggi,
stelle, elimina richiesta): verdi. axe su tutte le 24 pagine: 0. Foto dopo in
`/mnt/project-files/anteprime/admin-riordino/dopo-pr1/`.
`e2e/scripts/admin-dati-prova.ts` crea in locale i casi del collaudo per
riprovare l'Admin (non gira in CI).
