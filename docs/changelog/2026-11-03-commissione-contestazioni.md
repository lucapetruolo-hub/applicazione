# Commissione di Stripe delle contestazioni (seguito di F-21)

**Richiesta** di Luca, dopo il controllo dal vivo del conto di prova di
Marco (acct_1UVsQe…): "effettua la prima miglioria: si deve contare la
commissione di 20 euro quando arriva la contestazione così le cifre tornano
sempre"; "i 20 euro li paga sempre lui".

**Cosa mostrava Stripe.** Ogni contestazione delle due di Paola (F22) ha tolto
60 € dal saldo di Marco: i 40 € contestati più **20 € di commissione di
Stripe** (movimento `adjustment` con `fee` 2000). Il sito contava i 40 € ma non
i 20 €: i 40 € delle due commissioni mancavano dai conti e finivano, senza
nome, nei bonifici degli altri lavori. Tutti gli altri movimenti del conto
(28 in tutto: pagamenti, trattenute, rimborsi, trattenute restituite)
tornavano al centesimo. Nessun bonifico era ancora partito (saldo disponibile
−120 €, in arrivo 1.218,24 €). La commissione per ricevere una contestazione
Stripe non la restituisce mai, nemmeno se si vince (quella per rispondere sì).

**Decisione.**
- `JobPayment.disputeFees`: la commissione di Stripe di ciascuna contestazione,
  letta dai movimenti della contestazione a ogni notizia di Stripe (addebito
  diretto). La stessa notizia arrivata più volte conta una volta. Dopo lo
  sblocco esce dal bonifico ancora da fare (o vi torna, se Stripe la
  restituisce).
- È sempre a carico del professionista, vinta o persa (decisione di Luca):
  Stripe la prende già dal suo saldo. Prima, persa per lavoro non conforme, il
  sito gli addebitava anche 20 € + IVA come debito: la pagava due volte.
  Tolto per l'addebito diretto; i vecchi pagamenti con l'addebito a
  destinazione restano com'erano.
- Allo sblocco esce prima dai soldi di quel lavoro
  (`releaseDisputeFeeEurCents`), così non abbassa i bonifici degli altri e non
  finisce nella nostra trattenuta. Nei soldi tenuti da parte per gli altri
  lavori (§268) conta anche lei.
- Scheda del professionista: riga "Commissione di Stripe per la
  contestazione", anche sui lavori tornati tutti al cliente. Se i soldi del
  lavoro contestato non bastano (F22 di Paola: 73,16 € contro 120 € presi),
  la parte che manca resta nella riga "Già preso da Stripe per un altro
  lavoro" del lavoro sbloccato dopo: su F13 46,84 € (6,84 € di trattenute più
  40 € di commissioni), uguale al conto vero.

**Impostazioni dei conti con Stripe vero.** Le tre della schermata
"Modifica proprietà account" (commissioni al conto collegato, saldi negativi
a Stripe, Dashboard completa) con Express non si possono avere: commissioni
al conto collegato richiedono i saldi negativi a Stripe, e Stripe rifiuta
Express con i saldi negativi a Stripe (prova del 28/10). Restano quelle
create dal sito: commissioni e saldi negativi alla piattaforma, Express,
bonifici manuali.

**Verifica.** Test nuovi in `direct-charges.test.ts` (commissione salvata,
stessa notizia due volte, dopo lo sblocco, sblocco con la sua riga, F13 con
il conto vero del 3/11) e in `online-payments.test.ts` (riepilogo); il test
della contestazione persa per lavoro non conforme ora controlla che non ci
sia il secondo addebito. `pnpm --filter @professionisti/api test` 1207 verdi,
typecheck dell'API verde.
