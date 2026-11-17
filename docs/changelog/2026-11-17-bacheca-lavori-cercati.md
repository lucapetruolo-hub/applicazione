# Bacheca "Lavori cercati": richieste non servite visibili a tutti (PR 1 di 3)

**Richiesta (Luca, 17/11/2026):** una bacheca dove chiunque vede le richieste
dei clienti, ma per rispondere un professionista deve iscriversi; prima uno
studio fatto da un team di esperti (`analisi/bacheca-richieste-versione-profonda.md`
nella cartella del progetto).

**Decisioni di Luca (17/11):** sì a tutte le proposte dello studio:
- in bacheca solo il "non servito": le richieste in attesa di un mestiere
  che nessuno fa ancora vicino al cliente (subito) e le richieste generali
  senza preventivi dopo 48 ore (precedenza agli iscritti della zona);
- al massimo 5 preventivi per richiesta dalla bacheca;
- mai foto, nome, contatti o via; titolo e riassunto riscritti dall'IA; nei
  comuni sotto i 5.000 abitanti solo la provincia;
- interruttore del cliente acceso di serie, con "Togli dai lavori cercati";
- risponde solo chi fa quel mestiere, entro 100 km;
- pagine mestiere + provincia sotto `/lavora-con-noi`: per le persone
  nessuna soglia, su Google con almeno **una** richiesta (non 3); schede
  singole mai su Google; niente dati strutturati JobPosting;
- nome "Lavori cercati"; "Avvisami alla prima richiesta" sì; il numero di
  richieste nelle pagine `/cerca` solo da 10 al mese nella provincia
  (`BOARD_CLIENT_COUNT_MIN`);
- schede con meno preventivi in cima; "Rispondi" sempre in fondo alla scheda.

**Questa PR (1 di 3): dati, giro orario e pagine pubbliche.**
- *Dati:* colonne nuove su `guided_requests` (`boardAt`, `boardTitle`,
  `boardSummary`, `boardPlace`, `boardProvince`, `boardTrade`,
  `boardOptOut`), migrazione `20261117150000_bacheca_lavori_cercati`, solo
  additiva.
- *Regole comuni:* `packages/shared/src/requestBoard.ts` (soglie, nomi e slug
  delle province, mestieri della bacheca = categorie + 8 lavori fuori
  servizio, tipi delle schede).
- *Giro orario:* `RequestBoardService.publishNew` (al minuto 20 di ogni ora)
  prende fino a 40 richieste generali non servite (mai dirette, dal link
  personale, urgenti, nascoste, ritirate o di account di prova), chiede a
  Claude Haiku titolo e riassunto senza dati personali (tetto
  `REQUEST_BOARD_AI_DAILY_LIMIT`, di serie 200 al giorno) e le mette in
  bacheca. Se l'IA non risponde o il testo contiene ancora un contatto la
  richiesta non entra (mai il testo originale). **Spento finché
  `REQUEST_BOARD_ENABLED` non è "true" su Render**: si accende dopo la PR 3
  (Privacy, Termini, interruttore del cliente).
- *Luogo:* `apps/api/src/request-board/large-comuni.ts`, i 2.413 comuni con
  almeno 5.000 abitanti (ISTAT 2020); gli altri mostrano "Provincia di …".
- *API pubblica:* `GET /request-board?mestiere=&provincia=&pagina=` (20 schede,
  prima quelle con meno preventivi, niente schede con 5 preventivi) e
  `GET /request-board/summary`, con un minuto di memoria breve.
- *Sito:* `/lavora-con-noi/<mestiere>/<provincia>` (nuova) e "Lavori cercati
  adesso" con le province in `/lavora-con-noi/<mestiere>`; sitemap con le
  pagine che hanno almeno una scheda (solo dopo il lancio, il sito è ancora
  privato).

**PR 2:** "Rispondi" (iscrizione con la richiesta, posti e raggio di 100 km,
"Avvisami alla prima richiesta"). **PR 3:** interruttore del cliente e "Le mie
richieste", Privacy e Termini, frasi vietate nel lint, numero nelle pagine
`/cerca`, misure in Admin.

**Verifica:** `board-rules.test.ts` (luogo per comuni grandi e piccoli, slug
delle province, mestiere delle richieste in attesa, testo con contatti
rifiutato, posti finiti, tempi senza "Oggi", ordine per posti liberi);
tipi e lint di `apps/api` e `apps/web`; pagine guardate da telefono e da
computer con un'API finta (foto in `anteprime/bacheca-richieste/` della
cartella del progetto).
