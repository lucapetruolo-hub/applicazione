# Falle nuove in glob, joi e minimatch

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
