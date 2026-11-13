# Admin: parole comuni misurate ed email delle decisioni in parole semplici

**Richiesta** (Luca, 13/11/2026, thread "Automatizzare l'admin e semplificare
le scritte"): dopo le scritte dell'Admin
(`2026-11-13-admin-scritte-semplici.md`), Luca ha detto sì alle tre migliorie
proposte: controllare anche le email che partono dalle decisioni admin, segnare
le parole fuori dal vocabolario di base, fare le schermate prima e dopo.

**Decisione**
- Nuovo controllo `apps/web/scripts/controlla-vocabolario-admin.mjs` dentro
  `pnpm lint`: conta le parole dei testi visibili dell'Admin che stanno nel
  Nuovo vocabolario di base di De Mauro (`vocabolario-di-base.txt`, elenco di
  pettarin/nvdb, licenza CC BY 4.0), riconoscendo plurali, femminili e verbi
  coniugati. Blocca sotto il 95%. Le parole del sito che l'admin deve sapere
  (email, preventivo, saldo...) sono in `PAROLE_DEL_SITO`.
  Con `--elenco` stampa le parole difficili più usate.
- Con le forme dei verbi riconosciute la quota vera era già del 98% (la stima
  del 90% contava "abbiamo", "puoi", "togli" come parole difficili). Riscritte
  comunque 26 parole difficili, ora al 99%: "Cronologia" → "Cosa è successo",
  "Caricamento…" → "Un momento…", "facoltativa" → "se vuoi", "app di
  autenticazione" → "app per i codici", "saldo scoperto" → "resto da pagare",
  "Sollecita il cliente" → "Scrivi al cliente per ricordarglielo"...
- `controlla-scritte-admin.mjs` controlla ora anche le email delle decisioni
  admin (problemi sul lavoro, rimborso rifiutato, segnalazioni, sospensione e
  chiusura dell'account, badge tolto, tipo di account cambiato) e i testi che
  finiscono dentro (`moderationActionOwnerText`, le spiegazioni già scritte,
  `jobIssueOutcomeText`): stesse parole vietate, stessa soglia Gulpease 60.
  Le altre email non cambiano.
- Riscritte: "ricorso" → "chiedere di rivedere la decisione", "misura" →
  "conseguenza" o "decisione", "preso provvedimenti" → "siamo intervenuti",
  "organismo di risoluzione extragiudiziale delle controversie o autorità
  giudiziaria" → "andare dal giudice, o da un ente che aiuta a fare pace senza
  tribunale". Il contenuto per legge resta (DSA art. 17: conseguenza, fatti,
  regola, chi ha deciso, come contestare), detto più semplice, come chiede lo
  stesso articolo ("chiaro e facilmente comprensibile").

**Verifica**: `pnpm lint` e typecheck del sito, typecheck e prove dell'API
(admin, segnalazioni, email, lavori, pagamenti), prove di shared, prove nel
browser admin-da-fare, admin-dopo-misura, segnalazioni, andamento-sito,
admin-persone, admin-due-passaggi, admin-proposte (telefono).
