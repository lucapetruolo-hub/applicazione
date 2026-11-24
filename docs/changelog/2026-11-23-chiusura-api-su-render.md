# Chiusura pulita dell'API su Render e controllo di HTTP/2

**Richiesta** (Luca, 23/11/2026, thread "Aggiornare il sito a Node 26"): "sì
al punto 1 e controlla il punto 4", dopo la domanda "cosa stiamo
tralasciando?". Punto 1: il segnale di chiusura di Render non arrivava
all'API. Punto 4: con Node 26 le funzioni di Vercel chiamano l'API in HTTP/2.

**Problema**: Render avviava l'API con `pnpm --filter @professionisti/api start`,
cioè una catena `sh` → pnpm → `sh -c` → `node dist/main.js`. A ogni deploy
Render manda SIGTERM al primo processo e, dopo 30 secondi, lo uccide. Nella
prova in locale (stesso comando lanciato con `sh -c`, SIGTERM al primo
processo, un flusso in tempo reale aperto) l'API restava accesa **38 secondi**
con il flusso aperto: il segnale si fermava a pnpm e non arrivava mai
all'API. La chiusura ordinata (`enableShutdownHooks`, attività a orario,
`RealtimeService.closing$` della PR #462) quindi non partiva, e su Render
l'API veniva uccisa di colpo.

**Decisione**: `startCommand` in `render.yaml` fa gli stessi passi dello script
`start` senza pnpm in mezzo, e con `exec` l'API prende il posto della shell:
`cd apps/api && node ../../packages/database/scripts/migrate-deploy.mjs && exec node dist/main.js`.
Le migrazioni restano prima dell'avvio, come prima. Anche lo script `start`
di `apps/api` ora usa `exec` (in locale un passaggio in meno). Non serve più
il ripiego "npm al posto di pnpm" all'avvio aggiunto in
`2026-11-23-node-26.md`; resta quello della build.

**Punto 4 (HTTP/2)**: l'API su Render risponde in HTTP/2 (`curl --http2`:
versione 2, 200); `fetch` di Node 26 verso l'API vera funziona (`/health`,
`/professionals/category-counts`); il sito non imposta intestazioni vietate
in HTTP/2 (`Connection`, `Keep-Alive`, `Transfer-Encoding`, `Upgrade`); la
prova sul sito vero partita dopo il deploy di Vercel con Node 26 (23/11 alle
12:04) è verde. Niente da cambiare; se servisse tornare a HTTP/1.1:
`VERCEL_FETCH_DISABLE_H2=1` su Vercel e Redeploy.

**Dopo l'unione** (Luca): se il servizio di Render non segue il Blueprint, in
Render → Settings → Start Command va scritto lo stesso comando di
`render.yaml`. Nel log del deploy successivo, alla chiusura della versione
vecchia non deve più comparire l'uccisione dopo 30 secondi.

**Verifica**: in locale con Node 26.13.1 e il comando di `render.yaml`
lanciato con `sh -c`: l'API parte (migrazioni, poi "API in ascolto"), e con
un flusso in tempo reale aperto si chiude subito al SIGTERM chiudendo anche
il flusso; con il comando di prima resta accesa 38 secondi. CI della PR.

## Controllo automatico dell'avvio (24/11/2026)

**Richiesta** (Luca, 24/11, miglioria proposta dopo l'unione della PR #469): un
controllo che blocchi la PR se qualcuno rimette pnpm nell'avvio di Render.

**Decisione**: `apps/api/scripts/check-render-env.mjs` (passo "Variabili di
Render e attività a orario" della CI) controlla anche che lo `startCommand`
di `render.yaml` finisca con `exec node dist/main.js` e non usi pnpm, npm,
npx o yarn; altrimenti la CI si ferma con il motivo e questo file.

**Verifica**: lo script passa con il comando attuale e si ferma con
`pnpm --filter @professionisti/api start` e con il comando senza `exec`.
