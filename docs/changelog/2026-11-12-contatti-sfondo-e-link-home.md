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
