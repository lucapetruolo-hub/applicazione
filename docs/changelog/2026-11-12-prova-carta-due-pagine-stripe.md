# Prova "iscrizione con la carta": le due pagine di Stripe

**Richiesta** (Luca, 12/11/2026): rendere stabile il controllo
`iscrizione-carta`, che passava o falliva a seconda del tentativo (PR #335 e
altri rami, giro 43254261318), senza indebolirlo.

**Causa trovata** (tracce dei 5 tentativi falliti del giro 43254261318):
Stripe sta provando una nuova pagina di Checkout (`checkout_guacamole`,
presente in tutte e 5 le tracce). In quella pagina il modulo della carta non
è più nella pagina ma dentro un riquadro di Stripe (Payment Element), con
campi `#payment-numberInput`, `#payment-expiryInput`, `#payment-cvcInput`,
`#payment-nameInput`, Paese di partenza "Stati Uniti" con il CAP e pulsante
`payment-form-submit-button`. La prova cercava solo `#cardNumber` della
pagina classica: il modulo era già lì, pronto (foto dell'ultimo istante), ma
la prova aspettava 30 s una casella che non esiste e falliva. Stripe sceglie
la pagina a caso a ogni sessione, per questo la stessa prova passava al
secondo tentativo. Non era un'attesa troppo corta: allungarla non serviva.

**Decisione**: `e2e/carta/iscrizione-carta.spec.ts` riconosce le due pagine
(classica e nuova) e compila i campi di quella che trova, cercando nella
pagina e nei suoi riquadri; con la nuova sceglie l'Italia e scrive il CAP
solo se Stripe lo chiede ancora. L'errore della carta rifiutata si cerca
anche dentro il riquadro, dove Stripe scrive "I fondi della carta non sono
sufficienti. Prova con un'altra." (primo giro della PR: la frase non era tra
quelle attese). La pagina pescata va nel resoconto della prova
("pagina di Checkout classica/nuova"), così si vede quando Stripe passa
tutti alla nuova. I controlli sono gli stessi di prima: stessa carta, stesso
risultato atteso su sito, database e Stripe, stessi tempi.

**Verifica**: tipi del pacchetto e2e senza errori; le due funzioni nuove
provate su due pagine finte (classica e con il riquadro) con Chromium;
controllo `iscrizione-carta` della PR verde, rilanciato più volte per
incontrare entrambe le pagine.

**Seguito** (Luca, 12/11/2026, "sì" alla miglioria): Stripe CLI della CI
(`stripe listen` del job `iscrizione-carta`) da 1.21.8 a 1.55.11, con
l'impronta SHA-256 presa dal file ufficiale `stripe-linux-checksums.txt`
della versione (c710bdb6…). Provata a mano: `stripe listen` ha ancora
`--api-key`, `--print-secret` e `--forward-to`, ma senza `--events` o `--all-snapshot` non
inoltra più nulla (primo giro della PR: "must specify events to forward",
nessuna carta salvata): si aggiunge `--all-snapshot`, cioè tutte le notizie
classiche come prima. Verifica: controllo
`iscrizione-carta` della PR verde.
