# Bacheca "Lavori cercati": "Rispondi", 5 preventivi, "Avvisami" e i mestieri che il sito non ha (PR 2 di 3)

**Richiesta (Luca, 17/11/2026):** seguito di
`docs/changelog/2026-11-17-bacheca-lavori-cercati.md` (PR 1, #396). Decisioni
già prese da Luca: risponde solo chi fa quel mestiere entro 100 km, al
massimo 5 preventivi per richiesta dalla bacheca, "Avvisami alla prima
richiesta" sì, pagina "Lavora con noi" anche per gli 8 lavori fuori servizio
("sì" del 17/11).

**Cosa cambia**
- *"Rispondi"* porta a `/rispondi?richiesta=<id>` (pagina di passaggio, mai su
  Google):
  - senza accesso → iscrizione da professionista con il mestiere già scelto,
    che si porta dietro la richiesta (anche passando da "Accedi");
  - con un account da professionista → `POST /request-board/reply`: se il
    profilo è visibile, fa quel mestiere (categoria del profilo o di una
    prestazione; per gli 8 lavori fuori servizio le parole del lavoro nelle
    prestazioni, nei patentini o nella descrizione) ed è entro 100 km
    (`BOARD_REPLY_RADIUS_KM`; un lavoro online solo a chi offre l'online), la
    richiesta entra nel suo elenco e si apre;
  - profilo assente o non ancora visibile → la richiesta resta da parte
    (`board_claims`) e arriva da sola appena il profilo è visibile (giro ogni
    10 minuti, `processClaims`); dopo 30 giorni la riga si cancella.
  - Il cliente è avvisato solo se è il primo a ricevere la richiesta, come per
    chi si iscrive dopo (§271); al professionista nessun "Nuova richiesta",
    l'ha scelta lui.
- *5 preventivi:* `Lead.fromBoardAt` segna le richieste prese dalla bacheca;
  con 5 preventivi attivi di altri il preventivo nuovo non parte
  (`QuotesService.createOrUpdate`), uno già mandato resta modificabile.
- *"Avvisami alla prima richiesta"* sulla pagina mestiere + provincia vuota:
  email + Turnstile + honeypot, `POST /request-board/alerts`, tabella
  `board_alerts`. Al giro orario che mette in bacheca una richiesta di quel
  mestiere in quella provincia parte un'email sola con il link alla pagina
  (mai dati del cliente) e la riga si cancella; dopo 180 giorni si cancella
  comunque.
- *Mestieri che il sito non ha:* `/lavora-con-noi/<antennista|spurghi|…>` con
  le richieste che li aspettano per provincia (`WAITING_TRADE_SEO`); l'invito
  è a iscriversi con il mestiere più vicino e scrivere il lavoro tra le
  prestazioni.
- Migrazione `20261117190000_bacheca_rispondi`, solo additiva (una colonna,
  due tabelle).

**Ancora spenta:** niente entra in bacheca finché `REQUEST_BOARD_ENABLED` non
è "true" su Render, dopo la PR 3 (interruttore del cliente, Privacy e
Termini: lì va citato anche l'indirizzo di "Avvisami").

**Verifica:** `board-rules.test.ts` (mestiere, prestazione di un altro
mestiere, 100 km, online, lavoro fuori servizio) e
`request-board-reply.test.ts` (cliente rifiutato, richiesta chiusa, già
ricevuta, posti finiti, senza profilo, aggiunta); test di quotes,
guided-requests, request-board ed email verdi; tipi e lint di `apps/api` e
`apps/web`. Pagine guardate da telefono con un'API finta (foto `pr2-*` in
`anteprime/bacheca-richieste/` della cartella del progetto).
