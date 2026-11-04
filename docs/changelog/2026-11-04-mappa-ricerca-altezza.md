# Mappa della ricerca a tutta altezza su computer

**Richiesta** (Luca, 04/11/2026, con una foto di `/cerca`): scorrendo la
lista dei risultati la mappa a destra resta ferma un po' in alto e lascia
uno spazio vuoto sotto.

**Causa**: la mappa si fermava a `top: 24px`, ma l'intestazione del sito è
fissa e alta 64px: i primi 40px della mappa (con il pulsante "Espandi mappa")
finivano sotto l'intestazione. L'altezza era `100vh - 140px`, quindi in
fondo restavano circa 116px vuoti.

**Decisione**: in `apps/web/src/components/ResultsListWithMap.tsx`, sopra i
700px, la mappa si ferma a 80px dall'alto (64px di intestazione + 16px) ed è
alta `100dvh - 96px` (16px anche in fondo, `100vh` per i browser senza
`dvh`). Il margine della colonna resta 280px oltre l'altezza della mappa,
come prima. Da telefono nulla cambia (sotto i 700px la mappa è un riquadro
di 320px nella pagina).

**Verifica**: con Playwright su `/cerca`, dopo aver scorso di 900px, a
1024×768, 1440×900, 1920×1080 e 760×900: prima la mappa andava da 24px a
`altezza − 116px`, ora da 80px a `altezza − 16px` in tutte le larghezze, e
"Espandi mappa" è visibile.
