# Domande frequenti: da 8 a 59, per clienti e professionisti

**Richiesta** (Luca, 16/11/2026, thread "Ampliare le domande frequenti"): dopo
lo studio sull'assistente IA (`analisi/assistente-ia-sul-sito.md` nei file del
progetto), fare solo la base di risposte scritte, **senza IA per ora**.

**Decisione**:
- Fonte unica `packages/shared/src/faq.ts` (`FAQ`, `FAQ_TOPICS`,
  `faqForAudience`, `faqByIds`): 30 domande per chi cerca e 29 per i
  professionisti, in cinque argomenti ciascuno. I numeri (giorni, ore,
  prezzi, percentuali, tetti) vengono dalle costanti, mai scritti a mano. Le
  vecchie 8 (`HomeFaq.tsx`, `WhatIfSection.tsx`) e le 10 di
  `/per-professionisti` e `/per-professionisti/pagamenti` ora le prendono da
  qui per `id`: stesso testo, nessun doppione. `WhatIfSection.tsx` tolto. Le due domande della home stanno in
  `faqHome.ts`, così la home non scarica tutte le altre risposte.
- `/faq`: scelta in alto "Per chi cerca" / "Per i professionisti", argomenti
  come titoli, campo "Cerca tra le domande" (inizio di parola, senza accenti,
  senza IA), "Non hai trovato la risposta? Scrivici" in fondo.
  `?per=professionisti` apre la parte giusta (link "Tutte le domande" da
  `/per-professionisti`), un professionista che ha fatto l'accesso la trova
  già aperta, `#id` apre e illumina una domanda (ancore stabili per i link
  futuri). Le domande sui pagamenti online spariscono o cambiano testo finché
  i pagamenti online sono spenti; quella dei mesi gratis solo con un'offerta
  attiva (letta come in `/per-professionisti`). I link all'area del
  professionista compaiono solo a chi è professionista.
- Regole dei testi: solo fatti in funzione (Termini, `/problemi-e-rimborsi`,
  codice), mai "garantiamo" né prezzi decisi da noi (CLAUDE.md §5 punto 18),
  contatti del cliente solo dopo l'accettazione (§5 punto 9).

**Motivo**: un assistente risponde bene solo con risposte scritte; e già da
sole tolgono messaggi ai Contatti, soprattutto dai professionisti bloccati.

**Verifica**: `packages/shared/src/faq.test.ts` (id unici, argomenti validi,
`{mesi}` solo nella domanda dei mesi gratis, risposte brevi, ordine),
`pnpm lint` (anche frasi da intermediario) e `typecheck` di `apps/web`,
`next build` con `controlla-js-pagine-pubbliche.mjs` verde (`/faq`
303 KB compressi, home 342 KB), anteprime da telefono e computer in `anteprime/domande-frequenti/`.

## Secondo giro (16/11, "sì" di Luca alle tre migliorie)

- **"Ti è stata utile? Sì / No"** sotto ogni risposta di `/faq`. Il browser
  manda solo l'id della domanda e sì/no (`POST /site/faq-feedback`, stesse
  regole degli altri conteggi: niente robot, niente admin né chi ha scelto
  "Non contare questo browser", al massimo 20 al minuto); l'API conta solo
  gli id che esistono davvero in `FAQ`. Tabella `faq_feedback_days` (sì e no
  per giorno, mai chi ha risposto, cancellata con gli altri contatori dopo
  `SITE_COUNTERS_RETENTION_MONTHS`). Con "No" compare "Scrivici cosa
  mancava". In Admin → Andamento la scheda "Domande frequenti poco utili":
  ultimi 90 giorni dal lancio, prima quelle con più "No".
- **Piè di pagina**: "Domande frequenti" anche sotto "Per i professionisti"
  (`/faq?per=professionisti`).
- **Contatti**: sotto "Chi sei?" il riquadro "Forse cerchi:" con tre domande
  adatte (cliente: annullare, lavoro fatto male, come pago; professionista:
  profilo che non compare, limite lavori, annullare l'abbonamento), che
  aprono la risposta in `/faq#id`. Niente per "Altro".

**Verifica**: prova in `site-counts.service.test.ts` (sì/no contati, id
inventati ignorati), lint e tipi di sito e API, anteprime `utile-*.png` e
`contatti-*.png` in `anteprime/domande-frequenti/`.

## Terzo giro: risposte in Admin e domande di Contatti con proposta

**Richiesta** (Luca, 16/11): sì a "il testo della risposta accanto ai No" e a
"cambiare le 3 domande di Contatti secondo i No", "sempre tramite automazioni
che arrivano in admin con approva ed ignora".

**Decisione**:
- **Andamento → Domande frequenti poco utili**: ogni domanda con No e Sì,
  per chi è, e "Leggi la risposta" che apre il testo sul posto. Sotto, "In
  Contatti oggi" con le tre domande per pubblico e, se sono cambiate,
  "Rimetti quelle di partenza".
- **Contatti**: le tre domande stanno nella tabella `contact_faq_picks`
  (senza righe valgono `CONTACT_FAQ_DEFAULT`), lette da `GET /site/contact-faq`
  con 10 minuti di cache; il sito le ricontrolla (`contactFaqOrDefault`).
- **Proposta `CONTACT_FAQ`** nelle proposte di sempre in Home (Approva / Non
  ora / No, mai, docs/changelog/2026-11-03-automazioni-admin.md): ogni notte,
  per pubblico, la domanda fuori da Contatti con più No (almeno
  `CONTACT_FAQ_MIN_NO` = 5 in 90 giorni dal lancio) al posto di quella in
  Contatti con meno No, solo se ne ha di più. Mai domande dei pagamenti online
  o dei mesi gratis. Approva ricontrolla che valga ancora e scrive il registro
  azioni (`ContactFaqPick`). Permesso: moderazione.

**Motivo**: molti No dicono che è un dubbio che torna e che la pagina non
scioglie: è quello per cui la gente scrive. Niente cambia da solo (regola
delle proposte).

**Verifica**: prove in `admin-proposals.test.ts` (regola, Approva, Rimetti) e
`faq.test.ts` (domande di partenza valide, ritorno a quelle se le salvate non
valgono), tutte le prove dell'API, lint e tipi di sito e API.
