# Contatti con lo sfondo a velo, sottolineatura intera sui link della home

**Richiesta** (Luca, 12/11/2026, thread "Migliorare la pagina Contatti"):
controllare /contatti da esperto, correggere lo sfondo non allineato alle
altre pagine; in home la riga che compare sotto "Non trovi il tuo lavoro?" e
"Vedi tutti" al passaggio del mouse è spezzata.

**Decisione**:
- `/contatti` (`ContattiContent.tsx`): tolto il fondo crema pieno (`gesso`)
  del contenitore della pagina, che copriva lo sfondo a velo di tutto il sito
  (`.site-blobs`, `2026-11-12-sfondo-velo.md`). Le due schede bianche restano.
- `.home-section-action` (globals.css, usata anche da "Scopri di più" di
  `QualitySection`): da `inline-flex` con `gap` a riga semplice
  (`inline-block`, altezza 44 px con `line-height`). Con il flex la freccia
  era un elemento a sé, staccato di 4 px, e la sottolineatura si spezzava tra
  testo e freccia. Ora la riga sta intera sotto il testo (1,5 px, a 4 px) e
  la freccia, a blocco, non è sottolineata e si sposta di 2 px come prima.

**Verifica**: foto prima/dopo da computer e telefono in
`anteprime/contatti-sfondo/` della cartella del progetto; stile calcolato
`underline` al passaggio sul link "Vedi tutti" in locale.

## Secondo giro: migliorie della pagina Contatti

**Richiesta** (Luca, 12/11/2026): "effettua tutte le migliorie tranne n.4"
(la n.4, scrivere entro quanto si risponde, non si fa).

**Decisione**:
1. Prima delle schede, "Forse la risposta è già qui:" con tre link a pillola:
   Domande frequenti, Problemi su un lavoro (/problemi-e-rimborsi), Sicurezza
   e truffe.
2. "Segnalo un contenuto illegale" tolto dalle scelte di "Chi sei?" (non è
   un tipo di persona). Sotto il modulo: "Hai visto un contenuto illegale sul
   sito? Segnalalo qui", che apre lo stesso modulo di segnalazione (DSA art.
   16); da lì "Non è una segnalazione? Scrivi un messaggio" torna indietro.
   Il fuoco va sul campo email. Il link del piede (`?motivo=segnalazione`)
   resta uguale.
3. Tasto "Invia messaggio" o "Invia segnalazione" invece di "Invia".
5. Finché `COMPANY` ha i segnaposto, la scheda "Dati dell'azienda" non mostra
   più "[DA COMPILARE: …]" ma una riga ("compariranno qui all'apertura del
   sito"), come fa già il piede (`companyDataReady`). I dati veri si scrivono
   in `packages/shared/src/brand.ts` prima del lancio (checklist di lancio).
6. Etichette vere (`<label htmlFor>`) sui campi al posto di testo + aria-label.
7. `Section` del sito (packages/ui/src/Section.module.css) con fondo
   trasparente su tutte le pagine, non più solo in home: Domande frequenti e
   le altre pagine a sezioni mostrano lo sfondo a velo.

**Verifica**: prove e2e aggiornate (nomi dei tasti) e prova nuova sul
passaggio messaggio/segnalazione in `segnalazioni.spec.ts`; foto in
`anteprime/contatti-sfondo/` (v2-*).

## Terzo giro (13/11/2026)

**Richiesta** (Luca): sì alle due migliorie proposte prima di unire.

**Decisione**:
- Da telefono i link "Forse la risposta è già qui" sono più compatti (15 px,
  senza icona, su una riga sola) e stanno due per riga: Domande frequenti e
  Sicurezza e truffe sopra, Problemi su un lavoro sotto. Altezza 44 px.
- Contrasto dei testi con lo sfondo a velo misurato su 19 pagine pubbliche
  (home, Contatti, FAQ, Prezzi, Sicurezza, Problemi e rimborsi, Per i
  professionisti, pagine legali, Urgente, Preventivo, Cerca, accesso e
  registrazione), da telefono e computer, contro il punto più scuro del velo
  (#e4ecf5, azzurro in alto a destra): nessun testo sotto 4,5:1 (3:1 per i
  titoli grandi). Il grigio dei testi secondari (#5E5A54) sta a circa 5,9:1.
  Nessuna modifica necessaria. Anche axe (color-contrast) non trova errori.
