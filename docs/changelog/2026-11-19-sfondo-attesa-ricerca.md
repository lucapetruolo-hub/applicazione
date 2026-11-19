# Sfondo della home mentre carica la ricerca

**Richiesta** (Luca, 19/11/2026): "quando clicco su cerca dalla homepage,
mentre carica sempre su homepage per qualche secondo si vede lo sfondo vecchio
attorno alla schermata principale e non lo sfondo attuale".

**Causa**: durante l'attesa della ricerca dal problema `HomeHero` accende
`GlowLights tone="chiaro"` con `radius={40}`: un livello con angoli di 40 px,
grana (`::after`) e luci tagliate ai bordi, rimasto dal vecchio hero verde
(tolto l'11/11, docs/changelog/2026-11-11-home-caroselli-larghi.md). Sopra il
velo del sito (docs/changelog/2026-11-12-sfondo-velo.md) si vedeva come un
rettangolo arrotondato di un altro colore attorno a titolo e ricerca.

**Decisione**: le luci restano (attesa "viva", luci che accelerano del 03/11)
ma senza riquadro: niente raggio, niente grana, sfumate verso i lati con la
stessa maschera di "Richiesta inviata" (`.glow-lights--sfumato`), spostate
verso il centro e con i colori del velo e della barra di attesa (azzurro,
rosa, lilla) invece di verde e terracotta della vecchia palette
(`.home-hero-lights` in `globals.css`).

**Verifica**: riprodotto sul sito vero (computer 1366 px e iPhone 13, risposta
di /cerca ritardata): prima il rettangolo, dopo nessun bordo. Prova
`e2e/tests/sfondo-attesa-ricerca.spec.ts` (raggio 0, nessun fondo né grana,
maschera sfumata). Foto in anteprime/sfondo-attesa-ricerca/.

## Secondo giro: le altre luci chiare (stesso giorno)

**Richiesta** (Luca, "sì" alla miglioria proposta): controllare se altre pagine
hanno ancora riquadri con i colori della vecchia palette.

**Trovate**: l'apertura di /per-professionisti (luci verde e terracotta con
grana, bordi netti ai lati) e "Richiesta inviata" (stessi colori). Le altre
luci (`tone="verde"` nella tessera "Non trovi il tuo lavoro?", `tone="scuro"`
nel riquadro per i professionisti) stanno dentro riquadri colorati voluti e
restano.

**Decisione**: la classe è diventata generica, `.glow-lights--velo`, usata
nei tre punti con `.glow-lights--sfumato` (sfumate su tutti i lati). Tolta
`.glow-lights--sfuma` (solo in basso), non più usata. Foto prima/dopo di
/per-professionisti in anteprime/sfondo-attesa-ricerca/.
