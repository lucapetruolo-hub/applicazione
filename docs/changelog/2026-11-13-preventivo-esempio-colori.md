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
