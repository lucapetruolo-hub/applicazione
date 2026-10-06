# Chief Legal Advisor — Privacy e Compliance

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Segnaposto `[DA COMPILARE]` pubblicati in `privacy/page.tsx`, `contatti/ContattiContent.tsx`, `accessibilita/page.tsx`.
- 2026-09-28 — Banner cookie senza "Rifiuta" né revoca (`components/CookieBanner.tsx`): vietato dalle linee guida del Garante 2021. Non era nella checklist.
- 2026-09-28 — `/termini` non copre DSA (reclamo interno, punto di contatto, moderazione, regole sui contenuti); §6 "non rispondiamo di danni" da validare (Codice del Consumo artt. 33-36).
- 2026-09-28 — Esenzione hosting DSA art. 6 a rischio con claim "verificati" senza verifica (art. 6.3).
- 2026-09-28 — Dichiarazione al salvataggio del profilo aggiunta con data/versione; è una prova, non un esonero.
- 2026-09-29 — Controversie: nessun obbligo di accordi con organismi esterni ora (non parte nelle liti cliente↔pro; esenzioni piccole imprese DSA art. 19 per art. 20-21 e P2B art. 11-12). `/termini` non descrive né procedura problemi (§164) né carattere non vincolante della decisione admin né mediazione D.Lgs. 28/2010; manca clausola ADR/"piattaforma ODR abolita" (Reg. 2024/3228).
- 2026-09-29 — `resolveJobIssue` (`apps/api/src/admin/admin.service.ts`) richiede motivazione (zod min 3, `jobIssues.ts`), la notifica a entrambe le parti e la registra in AuditLog: ok. Frase "organismo di risoluzione extragiudiziale" già in `segnalazioni/page.tsx` e `notifications.service.ts` (generica, senza organismo nominato).
- 2026-10-02 — Banner cookie ancora con un solo tasto "Ho capito" (`CookieBanner.tsx`), nessun Rifiuta né revoca in `cookieConsent.ts`/`cookie/page.tsx`.
- 2026-10-02 — Registro (`docs/registro-trattamenti.md` §elenco responsabili) superato: Stripe/Resend "non attivi", mancano Sentry, Vercel Analytics, Google Maps/Places/Geocoding, ancora Nominatim; DPA tutti "[DA VERIFICARE]". `/privacy` §7 extra-UE generico (nessun fornitore/paese/garanzia nominati), lettura chat admin dichiarata in §3(d) ma base giuridica non esplicitata.
- 2026-10-02 — Età: dichiarazione 18+ obbligatoria (`schemas.ts` declaredAdult, `auth.service.ts`): ok.
- 2026-10-02 — Ranking: popup in `ResultsListWithMap.tsx` dichiara "boost prima" ma poi "nessuno può comprare una posizione più alta della valutazione reale" (contraddittorio) e omette declassamento `demotedUntil`/pausa; `/termini` senza parametri ranking P2B art. 5, preavviso 30gg modifiche (art. 3) e motivazione sospensione (art. 4). Badge "In evidenza" presente (`ProfessionalCard.tsx`).
