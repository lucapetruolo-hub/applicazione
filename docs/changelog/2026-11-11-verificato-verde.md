# Bollino "Verificato" verde invece che terracotta

**Richiesta** (Luca, 11/11/2026, thread "Creare nome, logo e identità del
sito"): "Il badge verificato in color marrone sembra un errore". Tra quattro
alternative a confronto (cipresso pieno, cipresso chiaro, blu, bianco con bordo
verde) ha scelto la B, cipresso chiaro.

**Decisione**: il bollino "Verificato" (etichetta `Badge` variante
`verificato`, schede dei professionisti sul sito e nell'app, profilo pubblico,
caroselli "Nuovi professionisti" e recensioni, segno in "Profilo" della
dashboard) passa dalla terracotta (`#A3441F` su `#F6E3D9`) al verde "fatto"
`brand.verificato` `#325F54` sul velo `brand.cianografiaVelo` `#E1EEEB`, gli
stessi colori di "Pagamenti online". Lo distingue il segno di spunta. La
terracotta resta solo nelle luci dello sfondo e nei colori delle categorie
(token `brand.terracotta` invariato). Sostituisce il punto "Verificato in
terracotta" di docs/changelog/2026-11-11-palette-e-figtree.md.

**Motivo**: accanto al rosso di "Urgente" la terracotta si leggeva come un
avviso; il verde è il colore del sito e dice "a posto".

**Verifica**: contrasto 6,1:1 (AA). Lint, typecheck e test di web e ui.
