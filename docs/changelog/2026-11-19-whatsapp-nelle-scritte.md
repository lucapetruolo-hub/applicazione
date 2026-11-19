# "E WhatsApp" anche dove mancava

**Richiesta** (Luca, 19/11/2026, dal collaudo totale in
`/mnt/project-files/collaudo/2026-11-19-collaudo-totale/rapporto.md`, voce T1):
la home dice "Promemoria via email e WhatsApp", il resto del sito solo
"email". Il collaudo proponeva di togliere WhatsApp dalla home; Luca: "verrà
implementato prima del lancio sicuramente e dobbiamo essere già pronti, quindi
si può aggiungere anche dove manca".

**Decisione**: la frase della home resta; "e WhatsApp" entra anche in
- "Compreso in ogni livello" (`packages/shared/src/plans.ts`, la legge
  /per-professionisti e la pagina Abbonamento): "Promemoria via email e
  WhatsApp, così il cliente non si dimentica";
- FAQ del professionista "Il cliente riceve un promemoria dell'appuntamento?"
  (`packages/shared/src/faq.ts`): "per email e, se lo ha acceso, su WhatsApp".

**Motivo**: una sola promessa in tutto il sito. "Se lo ha acceso" perché su
WhatsApp il promemoria parte solo a chi ha confermato il numero in Notifiche.

**Da ricordare**: se al lancio il canale non è acceso le tre frasi si tolgono
insieme (checklist di lancio, punto 22).

**Verifica**: `pnpm lint` e prove di `packages/shared`.

## Home, riquadro per i professionisti (voce T2)

**Richiesta** (Luca, 19/11/2026: "sì"): "Agenda, preventivi e fatturazione in
un'unica dashboard" diventa "Agenda, preventivi e documenti in un posto solo"
(`apps/web/src/components/ProCtaSection.tsx`).

**Motivo**: il sito non fa le fatture del professionista (CLAUDE.md §6: mai
nulla all'Agenzia delle Entrate per conto suo) e "dashboard" è gergo.

## Home, "Pagamento online protetto" (voce T3)

**Richiesta** (Luca, 19/11/2026: "sì"): "I soldi restano bloccati fino alla tua
conferma" diventa "fino alla tua conferma, o 7 giorni dopo il lavoro"
(`apps/web/src/components/QualitySection.tsx`).

**Motivo**: senza conferma e senza segnalazioni i soldi si sbloccano da soli
dopo 7 giorni (`ONLINE_RELEASE_DAYS`): la frase di prima prometteva di più.

## "Problemi e rimborsi" con le regole del 18/11 (voce T5)

**Richiesta** (Luca, 19/11/2026: "sì"): la pagina era ferma al 30 ottobre.

**Decisione**: nuova parte "Prima del lavoro: cambiare data o finire prima"
(`apps/web/src/app/problemi-e-rimborsi/page.tsx`, ancora `#cambiare-data`):
data proposta da uno dei due, annullamento senza perdere l'acconto se a
spostare per primo è il professionista, "Il lavoro è già finito?" quando
termina in anticipo. Sono le stesse regole già scritte nei Termini
(docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md), in parole
semplici. Data della pagina: 19 novembre 2026.

## FAQ: "diritto di chiamata" al posto di "uscita" (voce T6)

**Richiesta** (Luca, 19/11/2026: "sì"): nelle FAQ "Chi decide il prezzo?" e
"Come faccio un preventivo?" le voci erano "manodopera, materiali, uscita";
nell'esempio in home e nel preventivo la stessa voce si chiama "Diritto di
chiamata" (PR #353). Ora una parola sola ovunque (`packages/shared/src/faq.ts`).
