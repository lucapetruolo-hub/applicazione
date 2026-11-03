# Pagina Oggi più leggera sui telefoni lenti

**Richiesta**: dopo l'unione del passaggio a Next.js 16 (#213) il controllo
"agenda-browser (misure-lighthouse)" è rosso sul ramo principale: la pagina
Oggi (`/dashboard`) ha un TBT di 520 ms, oltre il limite di 500 (stesso
risultato, 512 ms, sulla PR di Tamagui 3). Alleggerire la pagina senza alzare
il limite né indebolire il controllo.

**Cosa pesava**: Oggi era già la pagina più pesante delle nove misurate
anche prima di Next.js 16 (in CI tra 379 e 523 ms negli ultimi giri, contro
335-438 di Richieste): Next.js 16 l'ha solo spinta oltre il limite. Con il
profilo della CPU e le mappe dei sorgenti, su un telefono rallentato:
- una decina di risposte dell'API (richieste, appuntamenti, lavori aggiunti a
  mano, meteo, andamento, abbonamento, profilo, più le quattro del percorso
  "Completa il profilo") ridisegnavano **tutta la pagina ognuna in un blocco
  unico**: la stessa causa già tolta all'agenda nella §345 di
  `docs/CHANGELOG.md`, ma Oggi era rimasta fuori;
- all'apertura partivano 18 richieste insieme, nello stesso blocco:
  l'abbonamento tre volte (pagina, percorso, pallini del menu) e lo stato
  delle verifiche due.

**Cosa è cambiato** (nessun cambio di aspetto né di comportamento):
- Le risposte dell'API in Oggi aggiornano la pagina con `startTransition`,
  come l'agenda: React disegna a piccoli pezzi e il telefono resta libero di
  rispondere al dito mentre la pagina si riempie. Vale anche per
  l'aggiornamento in background (nuova richiesta, preventivo accettato).
  "Sto arrivando" resta immediato.
- Il percorso "Completa il profilo" (`useSetupJourney`) aspetta le sue tre
  risposte e le mostra in un solo ridisegno: prima erano quattro. Il riquadro
  compariva comunque solo con tutte e tre.
- Abbonamento e stato delle verifiche si chiedono una volta sola anche se li
  vogliono insieme la pagina, il percorso e il menu: stesso meccanismo già
  usato per il profilo (`apps/web/src/lib/myProfessionalProfile.ts`, ora con
  `loadMySubscription` e `loadMyVerificationStatus`). Chi li chiede quando
  la richiesta è già tornata la rifà, quindi dopo un pagamento non si legge mai
  un abbonamento vecchio. All'apertura di Oggi le richieste all'API passano
  da 18 a 15.

**Limite della prova**: invariato a 500 ms, nessun controllo tolto.

**Verifica**: in locale (macchina più lenta e rumorosa della CI) prima e dopo
alternati sulla stessa macchina, Lighthouse "telefono lento", 9 giri per
parte: TBT di Oggi mediano da 1096 a 938 ms, mentre Richieste, che non
cambia, resta uguale nel rumore (994-1163 contro 1004-1238). Nella
registrazione del browser i ridisegni delle risposte non compaiono più come
blocchi lunghi. Prove nel browser di Oggi, menu laterale e primo uso
dell'agenda (telefono in Italia e computer a Tokyo) verdi, typecheck e lint
verdi. Il numero vero è quello della CI della PR.

## Secondo giro: Richieste

**Richiesta di Luca** (03/11): "effettua tutte le migliorie e i controlli che
ritieni".

- **Richieste** (`/dashboard/richieste`): era la seconda pagina più pesante
  nella CI della PR (473 ms). Stessa cura di Oggi: le risposte dell'API
  (richieste, appuntamenti, orari liberi, profilo, abbonamento, pallini dei
  messaggi) arrivano con `startTransition`, gli stati che vanno insieme nella
  stessa transizione; l'abbonamento passa da `loadMySubscription`. In locale,
  prima e dopo alternati, 9 giri per parte: TBT mediano da 508 a 415 ms.
- **Agenda e Orari**: già a pezzi dalla §345. Nella registrazione del browser
  restano solo l'avvio degli script comuni a tutte le pagine (Tamagui, React)
  e un blocco breve all'avvio delle richieste: niente di proprio della pagina
  da togliere. Nessun cambio; il peso comune si misura nella PR di Tamagui 3.
- **Abbonamento in memoria per tutto il sito: non fatto.** Tenerlo da una
  pagina all'altra rischierebbe di mostrare un abbonamento vecchio dopo un
  pagamento; basta che non parta due volte nella stessa pagina (fatto).

**Verifica**: prove nel browser di tastiera, menu laterale, Oggi (telefono in
Italia e computer a Tokyo) verdi; typecheck e lint verdi; foto della pagina
Oggi da telefono controllata.

## Terzo giro: pagine del cliente misurate

**Richiesta di Luca** (03/11): "effettua seconda miglioria" (aggiungere al
controllo Lighthouse le pagine del cliente, che non erano misurate).

- **Prova Lighthouse** (`e2e/lighthouse/agenda.mjs`): misura anche "Le mie
  richieste" (`/le-mie-richieste`) e la chat (`/chat`) con la sessione del
  cliente degli appuntamenti di prova, stesso limite di 500 ms. Se la sessione
  del cliente non si apre la prova si ferma (mai misurare la pagina "Accedi").
  Il cliente di prova ora ha la password (`e2e/fixtures/global-setup.ts`,
  `clientEmail` in `.auth/data.json`) e accede solo dentro la prova
  Lighthouse: con l'accesso in `global-setup` una metà delle prove nel browser
  superava il limite di 10 accessi al minuto (D2 delle doppie prenotazioni
  falliva nella CI).
- **"Le mie richieste" più leggera**: la prima misura in locale era 700 ms,
  la più pesante di tutte. Stessa cura di Oggi (risposte con
  `startTransition`) e in più all'apertura le richieste e i lavori non
  partono due volte: il primo giro dei pallini non le richiede di nuovo,
  stavano già arrivando. Prima/dopo alternati in locale, 9 giri per parte: TBT
  mediano da 739 a 477 ms. La chat del cliente era già a 335: nessun cambio.

**Verifica**: prove nel browser di elimina richiesta, preventivo accettato,
schede del lavoro, stelle dei preventivi, fumetti dei badge e admin (telefono
in Italia e computer a Tokyo) verdi; typecheck e lint di sito e prove verdi.

## Quarto giro: best-practices e avvio dell'area professionista

**Richiesta di Luca** (03/11): "effettua le due migliorie".

- **Best-practices 96 su tutte le pagine**: l'unico avviso era "errori in
  console", due per pagina, dallo script delle statistiche di Vercel
  (`/_vercel/insights/script.js`), che esiste solo sul sito pubblicato da
  Vercel. Ora `<Analytics />` si carica solo con `VERCEL` impostata nel build
  (`apps/web/src/app/layout.tsx`): sul sito vero non cambia nulla, nelle prove
  e in locale niente più errori. Lighthouse in locale: best-practices 100 su
  Oggi, Agenda e Orari.
- **Avvio dell'area professionista**: nella registrazione del browser di
  Orari, un terzo dell'avvio degli script (71 ms su 183, telefono rallentato)
  era zod che creava tutti i 217 controlli dei moduli di `schemas.ts`. Li
  portava il riquadro "Metti in pausa" (`AwayCard`, in Oggi e in Agenda), che
  usava solo il numero `MAX_AWAY_DAYS`. Il numero ora sta in
  `packages/shared/src/away.ts`: `schemas.ts` non si carica più in Oggi,
  Agenda e Orari, e l'avvio degli script di Orari scende da 183 a 138 ms. Nel
  TBT di Lighthouse in locale la differenza resta nel rumore della macchina
  (mediana di Orari da 548 a 505 ms). Restano circa 30 ms di zod da altri
  moduli condivisi (pagamenti online, contabilità, DAC7, ritiro richiesta) che
  uniscono schemi e funzioni nello stesso file: separati nel quinto giro.
- Il menu del professionista e il contatore delle notifiche, sospettati
  all'inizio, nella registrazione pesano pochi millisecondi: nessun cambio.

**Verifica**: tutte le prove nel browser del telefono in Italia (le due metà,
136 prove) verdi; test del pacchetto condiviso, typecheck dell'API, lint del
sito verdi.

## Quinto giro: controlli zod separati dalle funzioni

**Richiesta di Luca** (03/11): "effettua le migliorie".

- **Otto moduli condivisi divisi in due** (`accounting`, `agendaTools`,
  `bankDisputes`, `dac7`, `jobIssues`, `onlineLimit`, `onlinePayments`,
  `requestWithdraw`): i controlli dei moduli (zod) e i loro tipi stanno ora in
  `<nome>Schemas.ts` accanto, come già `notificationSchemas.ts`. Le pagine che
  usano solo le funzioni non creano più quei controlli. L'API e gli import da
  `@professionisti/shared` non cambiano (`index.ts` esporta anche i nuovi file).
- **Settimana tipo**: l'editor (`WeekTemplateEditor`, sempre visibile in Agenda)
  creava all'apertura il controllo zod della settimana solo per abilitare
  "Salva la settimana". Ora il controllo (`apps/web/src/lib/weekTemplateCheck.ts`,
  stesso schema dell'API) si carica alla prima modifica: la settimana arrivata
  dal server è già controllata. Se non si carica (senza rete) il salvataggio
  resta possibile e lo ricontrolla l'API. Nella registrazione del browser di
  Agenda (telefono rallentato) zod all'avvio scende da circa 100 a 21 ms.
- **Cosa resta, scoperto misurando**: aprendo Oggi il sito prepara in anticipo
  14 pagine dei link visibili (menu, piè di pagina) e ne esegue il codice
  mentre Oggi si carica: solo la pagina Profilo costa circa 180 ms sul telefono
  rallentato, e porta con sé zod. Vedi il sesto giro.

**Verifica**: test del pacchetto condiviso (29), typecheck di API e sito, lint
del sito verdi; prove nel browser di settimana tipo, orari, primo uso
dell'agenda, Oggi e agenda senza rete (telefono in Italia e computer a Tokyo)
verdi, compresa "orari sbagliati: non si salva".

## Sesto giro: pagine dei link preparate al tocco

**Proposta a Luca** (03/11), opzione consigliata: preparare le pagine dei link
solo quando il dito o il mouse ci passa sopra.

- **Cosa succedeva**: Next.js prepara in anticipo ogni link visibile e ne
  esegue il codice. Aprendo Oggi partivano 14 pagine (menu, intestazione,
  piè di pagina, link della pagina) mentre Oggi si caricava ancora; la sola
  pagina Profilo costava circa 180 ms sul telefono rallentato.
- **Cosa è cambiato**: `apps/web/src/components/IntentLink.tsx`, stesso uso di
  `next/link`, prepara la pagina al tocco del dito, al passaggio del mouse o
  col tasto Tab. Lo usano intestazione, menu dell'account e area personale,
  notifiche, piè di pagina, banner dei cookie e della verifica email, menu
  admin, la pagina Oggi e il percorso "Completa il profilo". Gli altri link del
  sito restano come prima.
- **Misura** (registrazione del browser, telefono rallentato 4x, 5 giri
  alternati, tempo bloccante oltre i 50 ms): Oggi mediana da 375 a 325 ms,
  Agenda da 533 a 211 ms.

**Verifica**: tutte le prove nel browser del telefono in Italia (136) verdi;
typecheck e lint del sito verdi.

## Settimo giro: Le mie richieste senza salti

Nella CI, dopo il sesto giro, tutte le pagine sotto il limite (Oggi 145 ms
contro 549 del ramo principale, Agenda 182, Orari 150), ma "Le mie richieste"
aveva un CLS di 0,157: le schede comparivano e poi venivano spinte giù.

- Richieste e lavori arrivano insieme in un solo ridisegno
  (`Promise.allSettled` in `reload`): mostrarne una lista prima dell'altra
  cambiava le schede già sullo schermo.
- Le schede di stadio ("Tutte", "In attesa"...) e "Filtri" si vedono già
  durante il caricamento: prima comparivano solo con i dati e spingevano giù
  le schede di 146 px sul telefono. Chi ha una sola richiesta le vede sparire
  all'arrivo dei dati, come prima la lista provvisoria.

**Misura** (telefono rallentato 4x, 3 giri): CLS da 0,157 a 0,001.
**Verifica**: prove nel browser del telefono in Italia verdi (139; una prova
admin lenta passata da sola); typecheck e lint verdi.
