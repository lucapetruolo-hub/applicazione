# Node 24.22.3, segnalazioni di CodeQL e prova dei 5 scelti (23/11/2026)

**Richiesta**: Luca ha chiesto cosa stavamo dimenticando; dal giro sono usciti
tre punti tecnici e ha detto "ok" a farli.

**Decisioni**

1. **Node 24.22.3** in `.nvmrc` (prima 24.22.1): è la correzione di sicurezza
   uscita il 10/11/2026, segnalata dal controllo giornaliero (issue #334).
2. **CodeQL sul ramo principale** era rosso da tempo per quattro segnalazioni
   vecchie; nelle PR restava verde perché lì guarda solo le righe cambiate.
   - `anonymizeProblemText` (`apps/api/src/problem-match/problem-match.service.ts`):
     la ricerca delle email ripartiva da ogni carattere, quindi un testo
     lunghissimo fatto di "+" faceva lavorare a vuoto il server. Ora parte
     solo dall'inizio della parola e il testo si taglia a 20.000 caratteri
     (ogni testo accettato dal sito è molto più corto).
   - `withNotificationItemChannel` (`packages/shared/src/notifications.ts`):
     il nome dell'avviso arrivava da fuori e diventava una chiave delle
     preferenze. Ora si accettano solo gli avvisi che esistono e si possono
     spegnere (`NOTIFICATION_ITEM_KEYS`); per gli altri le preferenze restano
     come sono. Il server già scartava i nomi sconosciuti al salvataggio.
   - `emailFingerprint` (`apps/api/src/common/email-fingerprint.ts`): falso
     allarme. CodeQL la scambia per l'impronta di una password, ma è
     l'impronta con chiave segreta di un indirizzo email. Non toccata qui: la
     scelta su come chiuderla è di Luca.
3. **Prova "al sesto tocco compare l'avviso del massimo"**
   (`e2e/tests/scelti-restano.spec.ts`): caduta il 20/11 da computer. Il tocco
   forzato sul pulsante spento non controlla cosa c'è sopra, e finiva sulla
   barra in alto del sito. Ora la prova porta prima il pulsante a metà schermo.
   Il sito non aveva difetti.

**Motivo**: un controllo di sicurezza sempre rosso non avvisa più di niente.

**Verifica**: prove di `packages/shared` e di `apps/api` (problem-match e
notifiche, 92 su 92), `typecheck` e `lint` verdi; `scripts/controlla-node.mjs`
dà attuale = ultima. CodeQL e le prove nel browser le fa la CI.
