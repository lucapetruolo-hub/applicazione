# Cache di Next.js in CI davvero senza i dati delle prove

**Richiesta** (Luca, 11/11/2026, thread "Rinnovare la home con caroselli stile
Apple"): sistemare in una PR a parte la prova `seo-sito-aperto`. Era rossa
quattro volte di fila sulla #325, una PR che toccava solo la home.

**Cosa succedeva**: il controllo segnalava che nella sitemap mancavano
"/prezzi/idraulico" e "/prezzi/idraulico/latina". In locale invece passava,
anche partendo da zero con gli stessi comandi della CI. Passava pure sul ramo
principale con lo stesso codice, una volta unita la #325. È lo stesso sintomo
già visto il 09/11 (`2026-11-09-pagine-pubbliche-senza-tamagui.md`): la
sitemap tiene i dati in `unstable_cache`, nella cartella
`.next/cache/fetch-cache`. Se quella cartella passa da una prova all'altra,
la prova dopo rilegge una sitemap vecchia senza prezzi.

**Causa**: la correzione del 09/11 escludeva `fetch-cache` con
`!apps/web/.next/cache/fetch-cache` accanto a `apps/web/.next/cache`. Però
actions/cache non scende nelle cartelle (`implicitDescendants: false` in
`@actions/cache`). Il percorso trovato era quindi solo la cartella `cache`,
e l'archivio la prendeva tutta, `fetch-cache` compresa: l'esclusione non
toglieva niente. Le PR ripartono dalla cache salvata dai giri della stessa PR,
quindi una sitemap vecchia restava lì e la prova falliva a ogni giro.

**Decisione**: nelle tre cache di Next.js di `ci.yml` il percorso diventa
`apps/web/.next/cache/*` e `fetch-cache` resta esclusa. Così si salvano solo
le cartelle di compilazione (oggi `turbopack`). Il percorso nuovo cambia anche
la chiave della cache, quindi le cache vecchie con i dati non si ripristinano
più.

**Verifica**:
- Provato con `@actions/glob` sulle stesse cartelle. Con `cache` e
  l'esclusione il risultato è `[apps/web/.next/cache]`, cioè tutto. Con
  `cache/*` e l'esclusione il risultato è `[apps/web/.next/cache/turbopack]`.
- I controlli della CI su questa PR, compreso `seo-sito-aperto`.
