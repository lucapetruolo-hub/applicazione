# Admin: scadenze del sito, controllo della notte, proposte nell'email del lunedì

**Richiesta** (Luca, 13/11/2026, thread "Automatizzare l'admin e semplificare
le scritte"): terza PR della proposta approvata
(`/mnt/project-files/analisi/admin-automatico/proposta.md`): le date da non
dimenticare in Da fare (il database gratuito scade il 5/12/2026), una prova
notturna del sito vero, il numero di proposte nell'email del lunedì.

**Decisione**
- Nuove tabelle `site_deadlines` (scadenze) e `site_checks` (esito dei
  controlli, una riga per controllo) con una migrazione solo additiva, che
  inserisce già la scadenza "Il database del sito scade: passalo al piano a
  pagamento" al 5/12/2026.
- Nuova pagina Admin → Impostazioni → **Scadenze e controlli**
  (`/admin/sito`, solo super admin): esito del controllo della notte, elenco
  delle scadenze con "Fatto" e "Togli", modulo per aggiungerne una, "Già
  fatte" in fondo. Ogni modifica va nel registro delle azioni.
- In **Da fare** (gruppo "Il sito", solo super admin) compaiono le scadenze
  che mancano da meno di 15 giorni (`SITE_DEADLINE_NOTICE_DAYS`) e i
  controlli che non vanno.
- **Controllo della notte** (`SiteHealthService.nightlyCheck`, alle 4 ora di
  Roma con `@ScheduledJob`): apre la home e `/cerca` del sito vero (va bene
  solo una risposta 2xx entro 20 secondi), guarda se un lavoro automatico
  delle ultime 26 ore è finito con un errore o è fermo da più di 2 ore, e,
  dopo il lancio con Stripe acceso, se da 7 giorni non arrivano eventi del
  webhook. Tiene la data del primo errore finché il problema resta. È un
  controllo del sito su se stesso, non una prova completa con account di
  prova (registrazione, preventivo): quella resta alle prove in CI.
- Email del lunedì agli admin: alla riga delle proposte da approvare si
  aggiunge il tempo stimato ("Ci vogliono circa N minuti", mezzo minuto a
  proposta); se ci sono solo proposte il pulsante porta a Da approvare.
- Le scritte nuove passano dai controlli di `pnpm lint` (parole vietate,
  Gulpease, vocabolario di base).

**Verifica**: prove dell'API (`site-health.test.ts`, admin, email), `pnpm
lint` e typecheck del sito, typecheck dell'API.
