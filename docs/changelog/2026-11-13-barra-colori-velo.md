# Barra di caricamento con i colori dello sfondo

**Richiesta** (Luca, 13/11/2026, thread "Aggiornare il colore della barra di
caricamento"): controllare i colori della barra che compare quando il sito ci
mette di più a caricare, e "aggiungere anche più colori visto che ora lo
sfondo nostro principale ha più colori".

**Controllo**: la barra (`.flow-bar` in `globals.css`, usata da
`NavigationProgress` in cima allo schermo, nei pulsanti bianchi e in "Cerca in
quest'area") usava già la famiglia del verde nuovo #1E6B6E / #247C7C dalla
#338. Gli altri segnali di attesa non hanno colori vecchi: sagome grigie
(`.skeleton-shimmer`, grafite diluito), pallini delle foto (grafite o bianco),
rotellina e barra bianca dentro i pulsanti verdi.

**Decisione**: la barra prende i colori dello sfondo a velo
(docs/changelog/2026-11-12-sfondo-velo.md), più carichi perché a 3 px si
vedano: verde di marca #1E6B6E, azzurro #3F8FB0, lilla #8E7CC8, rosa #E48AA3,
pesca #F0A46E, in andata e ritorno (verde → pesca → verde) così tra pesca e
verde non compare un marrone. Va contro la scelta "solo verdi" del 05/11
(docs/changelog/2026-11-05-barra-di-attesa.md), su richiesta esplicita di
Luca. Mostrata anche una versione "tenue" (pastello), non scelta: a 3 px si
vede poco sul velo chiaro. Restano bianche la barra e la rotellina dentro i
pulsanti verdi e rossi, verde quella nei pulsanti bianchi; sagome e pallini restano neutri.

Poi Luca sceglie la vivace e approva la miglioria: in cima allo schermo la
barra è alta 4 px sul computer (da 760 px di larghezza, come le altre regole del sito), 3 px sul telefono.
Luca chiede poi di non cambiare i pulsanti: dentro i pulsanti bianchi la
barra resta verde come prima (`.button-wait-overlay`), i colori del velo solo
nella barra in cima e in "Cerca in quest'area" sulla mappa.

**Verifica**: foto prima/dopo da telefono e computer e confronto ingrandito
delle versioni in `anteprime/barra-colori/` della cartella del progetto.
