# Misure di "Lavori cercati" (proposte C, D, E e G)

**Richiesta (Luca, 19-20/11/2026):** dalla versione profonda
`analisi/lavori-cercati-ai-professionisti-versione-profonda.md` Luca ha scelto
anche C, D, E e G; il 20/11 "Elabora un piano da massimo esperto del settore".
Piano scritto nel thread della bacheca; il 20/11 Luca: "Effettua anche le due
migliorie" (elenco del punto G nell'email del lunedì, avviso da 5 richieste
senza nessuno).

**Cosa cambia**
- *C. Uso della pagina:* contatori nostri per giorno (`board_use_days`,
  `POST /site/board`), perché gli eventi di Vercel Analytics richiedono il
  piano a pagamento. Azioni: pagina aperta, mappa caricata (solo la mappa vera,
  non l'immagine fissa), filtro, "Cerca in quest'area", "Vicino a me", cerchio
  toccato e "Rispondi" per punto di partenza (mappa, pagine per mestiere e
  provincia, riquadro in Oggi, email del lunedì) col parametro `da` del link,
  contato sulla pagina /rispondi. Solo azione e giorno; non conta chi ha
  "Non contare questo browser"; si cancellano dopo 25 mesi come gli altri.
- *D. Provenienza all'iscrizione:* chi passa da /lavora-con-noi o /rispondi
  ha un segno nella scheda del browser (`da_lavori_cercati`, sessionStorage);
  se si iscrive come professionista, anche con Google, l'account lo ricorda
  (`User.signupFromBoard`, migrazione additiva
  `20261120100000_misure_lavori_cercati`).
- *E. Il numero che conta:* in Admin, Richieste da seguire, quante richieste
  entrate in bacheca ricevono un preventivo entro 7 giorni e in quante ore
  arriva il primo (a metà), contro le richieste generali rimaste fuori (tolte
  dal cliente o non pubblicabili, senza preventivi nelle prime 48 ore),
  contate da quando sarebbero entrate. Sotto i 30 casi "7 su 9", non la
  percentuale. Calcolo in `apps/api/src/request-board/board-speed.ts`.
- *D in Admin:* professionisti iscritti partendo da Lavori cercati e quanti
  hanno mandato un preventivo entro 30 giorni.
- *G. Dove mancano professionisti:* province e mestieri con richieste in
  bacheca a cui nessun professionista visibile può rispondere entro 100 km
  (stesse regole di "Rispondi"), prima quelli con più richieste
  (`RequestBoardService.uncovered`).
- *Miglioria 1:* nell'email del lunedì "Cosa fare questa settimana" (super
  admin, dopo il lancio) una riga "Lavori cercati senza professionisti vicino"
  con i primi 5 mestieri e province (`boardUncoveredAdvice`).
- *Miglioria 2:* ogni mattina alle 9:40 avviso ai super admin (campanella ed
  email, tipo `ADMIN_BOARD_UNCOVERED`) quando un mestiere in una provincia
  arriva a 5 richieste in bacheca senza nessuno entro 100 km
  (`BOARD_UNCOVERED_ALERT_MIN`); lo stesso non si riavvisa per 7 giorni.
- Le regole di chi può rispondere sono ora in `board-coverage.ts`, funzioni
  usate dal servizio della bacheca e dall'Admin.
- Tutti i numeri dal lancio e senza account di prova. Privacy (punto 9) e
  pagina Cookie aggiornate.

- *Sicurezza:* osv-scanner segnalava `effect` 3.21.0 (usato da `@prisma/config`,
  GHSA-7589-6fvf-x4pw, corretto dalla 3.22.1): override a 3.22.4 in
  `pnpm-workspace.yaml`, l'ultima uscita da più di due settimane.

**Motivo:** senza questi numeri non si sa se la bacheca aggiunge preventivi e
professionisti, né dove reclutare.

**Verifica:** typecheck di API e sito, lint, prove di `request-board`
(nuove: `board-speed.test.ts`, "dove mancano professionisti"),
`problem-match`, `site-counts`, `auth`, prove di `packages/shared`.
