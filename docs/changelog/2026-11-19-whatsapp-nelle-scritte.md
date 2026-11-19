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

## Chiarezza: menu, "Tuttofare", "In evidenza nella tua zona" (voci C1, C3, C4)

**Richiesta** (Luca, 19/11/2026: "sì" a C1, C3, C4 e C5; C2 "lasciarle").

**Decisione**:
- **C1**: la voce "Quanto costa" (barra in alto, menu da telefono, fondo
  pagina) diventa "Quanto costa un lavoro": un professionista la scambiava
  per il prezzo dell'abbonamento. Provato sul sito da 900 a 1440 px: resta su
  una riga.
- **C3**: il mestiere "Tutto Fare" si scrive "Tuttofare"
  (`packages/shared/src/categories.ts`, il nome nel database si allinea da
  solo all'avvio con `CategoriesSeedService`), come già nelle frasi ("Ti serve
  un tuttofare", "Quanto costa un tuttofare") e come si cerca su Google. Lo
  slug `tuttofare` non cambia.
- **C4**: "Boost locale" diventa "In evidenza nella tua zona"
  (`BoostSection.tsx`), l'ultima parola inglese rimasta in vista.
- **C5 non fatta**: "Più lavori allo stesso cliente contano come uno" resta
  solo sotto Plus. Su Pro i lavori sono senza limite, quindi la frase non
  serve (scelta già scritta in `dashboard/abbonamento/page.tsx`, §362): il
  collaudo l'aveva segnalata per errore.
- **C2**: le due voci "Domande frequenti" in fondo restano.

## Le novità di novembre in "Compreso in ogni livello" (voci N1-N8)

**Richiesta** (Luca, 19/11/2026: "sì" a N1-N8): la pagina "Offri i tuoi
servizi" elencava 8 cose comprese e non diceva nulla di Oggi, dell'email unica
del mattino, del giro, della bacheca, del QR e del bollino, del calendario,
dei video e del confronto con la zona.

**Decisione**: nessuna sezione nuova (regola "scritte minime"): le novità
entrano in `SUBSCRIPTION_FEATURES` (`packages/shared/src/plans.ts`), una riga
l'una, così compaiono uguali in /per-professionisti e nella pagina Abbonamento.
L'elenco passa da 8 a 13 righe:
- N1 "Oggi: chi aspetta una risposta, i lavori di domani e quelli da chiudere";
- N2 "Una sola email al mattino con le cose di oggi";
- N3 "Giro della giornata: le tappe in ordine per fare meno strada";
- N5 "Codice QR da stampare e bollino con le tue stelle per il tuo sito";
- N6 "Agenda e prenotazioni online, anche nel calendario del tuo telefono";
- N7 "Richieste di preventivo dai clienti, con foto e video del lavoro";
- N8 "Bollino Verificato sul profilo, dopo il controllo del documento" e
  "Statistiche della tua attività, a confronto con i colleghi della tua zona".
- N4 (bacheca): in fondo a /per-professionisti la riga sopra i mestieri passa
  da "Lavora con noi come:" a "Guarda i lavori cercati nella tua zona, anche
  prima di iscriverti:" (i link portano già a `/lavora-con-noi/<mestiere>`,
  dove c'è la bacheca "Lavori cercati").

**Motivo**: ogni riga dice una cosa che il sito fa già oggi; nessuna promessa
nuova.
