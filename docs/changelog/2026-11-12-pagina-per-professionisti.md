# Pagina per i professionisti: difetti corretti e proposte A-H (12/11/2026)

**Richiesta** (Luca, thread "Migliorare la pagina per i professionisti"):
"sistema e migliora questa pagina e valutala come farebbe un professionista
di alto livello in questo campo" su /per-professionisti. Dopo l'analisi
(`analisi/per-professionisti/analisi.md` nella cartella del progetto): "a-h",
tutte le proposte.

**Difetti corretti**:
- Schermata dell'agenda rifatta dall'agenda vera con l'identità di #324
  (prima il verde acceso di prima e "Latina" due volte, contro "sito per
  tutta Italia"): professionista di prova a Bologna, nomi d'esempio, ora
  fissata a martedì 10/11 alle 10:20. Sul computer la settimana (1600×800,
  tagliata dove finisce il calendario), sul telefono la giornata (780×975).
- "Compreso in ogni livello": sul telefono le spunte delle righe che vanno a
  capo si rimpicciolivano (`flexShrink: 0`).
- Banda "GRATIS PER 3 MESI": sul telefono "MESI" restava da solo; carattere
  un po' più piccolo e righe bilanciate.
- La recensione d'esempio diceva "Giulia R." e sembrava vera: ora "Esempio"
  (niente testimonianze finché non ce ne sono di vere).

**Proposte fatte**:
- A. Invito finale: pulsante principale "Iscriviti gratis" verso la
  registrazione (prima "Scegli il tuo livello" riportava su ai prezzi);
  "Scopri di più" diventa "Come funzionano i pagamenti".
- B, C. Sotto i pulsanti del primo schermo tre punti con la spunta: "Nessun
  costo per contatto", "3 mesi gratis, poi 19 € + IVA al mese" (mesi e
  prezzo letti dall'offerta attiva e da `SUBSCRIPTION_TIERS`), "Annulli
  quando vuoi". Sostituiscono "Iscrizione gratuita. La carta serve solo per
  attivare i mesi gratis."; la carta resta detta nei prezzi ("in
  automatico"), nelle domande e nei Termini.
- D. Domanda sul limite di lavori: frase breve, il conto (10 € + differenza
  + 10%) dietro "Scopri di più".
- E. Ordine: "Tutto quello che serve" e "Come funziona" prima del
  "Pagamento online".
- F. Barra in alto: su /per-professionisti, /per-professionisti/pagamenti e
  /lavora-con-noi/* chi non ha un account vede "Iscriviti gratis"
  ("Iscriviti" sotto i 360 px) al posto di "Richiedi preventivo".
- G. Titolo per Google: "Lavora come professionista nella tua zona", con la
  descrizione che dice "senza costo per contatto".
- H. Sottotitolo più corto: "Richieste di lavoro vicino a te, preventivi
  chiari, agenda e recensioni. Tutto in un posto."

**Verifica**: typecheck e lint di `apps/web`; sito e API in locale con un
database di prova; foto prima e dopo di computer e telefono in
`anteprime/per-professionisti/` della cartella del progetto; nessuno
scorrimento orizzontale a 390 e 320 px.

## Secondo giro (12/11/2026): le tre migliorie in più

**Richiesta** (Luca): "si" alle tre migliorie proposte dopo la PR.

- /per-professionisti/pagamenti: l'introduzione diceva "il cliente sceglie
  come pagarti" mentre il riepilogo diceva "scegli tu i modi"; ora: scegli
  tu i modi nel preventivo, il cliente sceglie tra quelli. Acconto in due
  righe; il conto d'esempio (200 € → trattenuta 7% + IVA → ti arrivano)
  in un riquadro a tre righe invece che dentro il testo; pagamento diretto
  "in contanti, con bonifico o come vi accordate, nessuna commissione e
  nessun limite"; più spazio tra i punti; in fondo "Iscriviti gratis" (o
  "Vai a Fisco e pagamenti" per un professionista già iscritto).
- Plus o Pro dritti al pagamento dopo l'iscrizione: già così. Il livello
  toccato (`?livello=`) passa da registrazione e profilo fino alla finestra
  "Profilo salvato! Ora scegli il piano" con "Attiva Plus" (o Pro), che apre
  Abbonamento su quel livello. Il profilo serve prima (Stripe lo vuole,
  decisione di Luca del 30/10) e il clic per pagare resta del
  professionista: nessuna modifica.
- Schermata dell'agenda: anche due preventivi in attesa (bordo giallo
  tratteggiato), come nella settimana vera.

## Terzo giro (12/11/2026): domande e titolo della pagina dei pagamenti

**Richiesta** (Luca): "si" alle due migliorie facoltative.

- /per-professionisti/pagamenti: "Domande frequenti" con "Quando arriva il
  bonifico?" (conferma o 7 giorni, poi 1-4 giorni lavorativi, come la scheda
  del lavoro) e "E se il cliente contesta?" (segnalazione sul sito: 48 ore
  per accordarsi, poi decide il team; contestazione con la banca: decide la
  banca, soldi bloccati, commissione Stripe a carico del professionista,
  come nei Termini punti 5 e 6).
- Titolo per Google: "Come vieni pagato: acconto online e pagamento diretto".

## Quarto giro (12/11/2026): sfondo continuo mentre si scorre

**Richiesta** (Luca): "sistema le pagine in modo che lo sfondo non sembra
che si interrompa, mentre scorri la pagina"; poi "+" e "−" anche nelle
domande della pagina dei pagamenti.

- /per-professionisti: le celle delle griglie (vantaggi, come funziona,
  livelli Plus e Pro, domande) erano crema pieno su uno sfondo che era la
  linea (`gap` di 1 px): coprivano lo sfondo fisso del sito e scorrendo
  sembrava interrompersi a ogni sezione. Ora sono trasparenti, con i
  filetti fatti da bordi (`.pro-grid` in globals.css). Resta col suo fondo
  solo la scheda del livello gratis, che deve risaltare.
- Le luci dell'apertura sfumano verso il basso (`.glow-lights--sfuma`)
  invece di finire nette sul filetto sotto il titolo.
- Va con qualunque sfondo fisso del sito, anche il velo della PR "Sfondo a
  velo su tutto il sito".
- /per-professionisti/pagamenti: domande con "+" e "−" (`.pay-faq-item`).
