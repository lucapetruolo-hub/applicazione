# Controlli rossi dal 30/10: falle in glob, joi e minimatch e prova C2 dell'agenda

**Richiesta**: il controllo `osv-scanner` della CI è diventato rosso su ogni
PR per tre segnalazioni pubblicate il 30/10/2026 (GHSA-3g3m-2fjr-6pw4 glob,
GHSA-4528-x5fx-h6hg joi, GHSA-g3hv-75wg-m249 minimatch).

**Decisione e motivo**

- Tutti e tre i pacchetti stanno solo in strumenti di sviluppo (CLI di Expo,
  React Native e NestJS, ESLint): non finiscono nel sito, nell'API o nell'app.
- `overrides` in `pnpm-workspace.yaml`: joi 17.13.9 (correzione nella stessa
  serie), glob 14 e minimatch 11 al posto di glob 13 e minimatch 10 (stessa
  API, cambia solo la versione minima di Node, già soddisfatta).
- Resta minimatch 3.1.5 (eslint-plugin-jsx-a11y e fork-ts-checker-webpack-plugin,
  lint e build dell'API): la correzione c'è solo nella 11, con un'altra API.
  Il difetto è in `firstPhasePreProcess()` con `optimizationLevel`, codice
  che nella 3 non esiste. Un'eccezione in `osv-scanner.toml` si aggiunge solo
  con l'ok di Luca.

**Verifica**: `pnpm install`, lint di sito e API, build dell'API e
`expo config` dell'app senza errori.

## Prova "C2 chiudo un giorno" con la data fissa

Dal 31/10 la prova `tempi-compiti.spec.ts` C2 falliva su ogni PR: chiudeva
venerdì 30/10 con l'orologio del browser fermo al 26/10, ma l'API elenca i
giorni chiusi da oggi con il proprio orologio, quindi dopo il 30/10 il giorno
chiuso non tornava più e "Riapri venerdì 30" non compariva. Ora la prova usa
il lunedì vero successivo e il suo venerdì. Nessun cambio al sito.

**Verifica**: in locale (Postgres 16, API e sito compilati) la versione
vecchia fallisce come nella CI, la nuova passa con tutte le altre misure.

## Agenda aperta da un appuntamento, di domenica

Le prove `agenda-orari.spec.ts` sul telefono fallivano oggi (domenica
1/11): aprendo l'agenda da un appuntamento (`?booking=`, per esempio da
"Oggi" o da un'email) con la giornata di oggi vuota, la regola "di domenica
si apre la settimana di domani" (§311) spostava il calendario alla settimana
dopo, mentre il riquadro dell'appuntamento restava aperto su un altro giorno.
Difetto vero del sito, non solo della prova: ora con `?booking=` o
`?esterno=` l'agenda resta sul giorno dell'appuntamento.

**Verifica**: in locale, di domenica, le prove dell'ora italiana su telefono
(Italia e New York) prima fallivano e ora passano.
