# Preventivo d'esempio in home con i colori nuovi

**Richiesta** (Luca, 13/11/2026): in home il riquadro sotto "Ricevi preventivi
così" era rimasto col vecchio colore.

**Decisione**: il foglio del preventivo d'esempio (`.qx-quote` in
`apps/web/src/app/globals.css`, componente `QuoteExampleSection`) non è più
color carta con righe e bordo beige (vecchia palette): ora è bianco con righe,
bordo e puntini di guida in una tinta leggera del verde-azzurro di marca, il
bollino "Esempio" in verde chiaro (era ottone, il colore degli avvisi), la riga
e la scritta del totale in verde inchiostro come i titoli. I colori vengono dai
token del tema (`var(--c-cianografia…)`, `var(--c-calce)`, con il valore di
riserva accanto): se il verde di marca cambia ancora, il riquadro lo segue da
solo. Stesso trattamento allo sfondo della foto mentre si carica e al cursore
che scrive.

**Motivo**: il verde-azzurro #1E6B6E e i titoli #0F3B3B sono le scelte del
12/11/2026 (`2026-11-12-*`); il foglio beige stonava col velo dello sfondo.
Contrasti: "Esempio" #186163 su #DFF0F0 circa 6:1, totale #0F3B3B su bianco
oltre 11:1.

**Verifica**: foto prima/dopo da telefono (390 px) e computer (1280 px) con il
CSS nuovo applicato alla home pubblicata, in
`/mnt/project-files/anteprime/preventivo-esempio-colori/`.

## Secondo giro (Luca, 13/11/2026)

**Richiesta**: sì ai punti 1 e 3 delle migliorie proposte (spunta verde,
righe allineate); no al punto 2 (la freccia nel cerchio rosso dei pulsanti
di acquisto resta). In più: in /per-professionisti, fra i tre livelli, il Base
sembrava già scelto.

**Decisione**:
- Home, fascia per i professionisti: la notifica d'esempio "Preventivo
  accettato" ha la spunta nel verde di "fatto" (`brand.verificato`) invece che
  arancione `#FF8A3D`, come vuole la regola "verde = buone notizie".
- Preventivo d'esempio: niente più righe stampate sul fondo ogni 32 px, che
  non coincidevano con le voci; una riga leggera sotto ogni voce (tranne
  l'ultima, sopra il totale).
- /per-professionisti: le tre caselle dei livelli sono uguali, trasparenti
  sullo sfondo del sito. Prima solo il Base aveva fondo bianco e riga verde
  in alto, il modo classico di mostrare un'opzione già selezionata. Il Base
  resta riconoscibile per "Gratis" e "Offerta di lancio", il Plus per
  "Consigliato".

**Verifica**: foto prima/dopo (`riga-*`, `spunta-*`, `livelli-*`) nella stessa
cartella, fatte applicando le modifiche alle pagine pubblicate.
