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
  `clientToken` in `.auth/data.json`).
- **"Le mie richieste" più leggera**: la prima misura in locale era 700 ms,
  la più pesante di tutte. Stessa cura di Oggi (risposte con
  `startTransition`) e in più all'apertura le richieste e i lavori non
  partono due volte: il primo giro dei pallini non le richiede di nuovo,
  stavano già arrivando. Prima/dopo alternati in locale, 9 giri per parte: TBT
  mediano da 739 a 477 ms. La chat del cliente era già a 335: nessun cambio.

**Verifica**: prove nel browser di elimina richiesta, preventivo accettato,
schede del lavoro, stelle dei preventivi, fumetti dei badge e admin (telefono
in Italia e computer a Tokyo) verdi; typecheck e lint di sito e prove verdi.
