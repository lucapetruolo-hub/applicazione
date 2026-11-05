# Avvisi di sicurezza sulle librerie (05/11/2026)

**Richiesta** (Luca, 05/11/2026): GitHub segnalava 13 avvisi di sicurezza
sulle librerie del ramo principale (5 gravi). Guardarli e correggerli.

**Cosa erano**: quasi tutti in due librerie usate solo dagli strumenti di
sviluppo di Expo (`@expo/cli`), mai nel sito, nell'API o nell'app:

- `node-forge` 1.4.0: 11 avvisi (firme RSA, certificati, TLS, PEM). Prima non
  c'era una versione corretta, ora sì (1.4.1 e successive).
- `zod` 3.25.76: un avviso nuovo (memoria esaurita con elenchi enormi),
  corretto solo in zod 4. Le versioni nuove di `@expo/cli` non usano più zod 3.
- `deepmerge` 4.3.1: resta, nessuna versione corretta (eccezione già approvata
  da Luca il 27/10, docs/CHANGELOG.md §384).

**Decisione**: aggiornare Expo all'ultima correzione della stessa versione
(58.0.19 → 58.0.23, con `@expo/cli` 58.1.19 e `node-forge` 1.4.3) e, insieme,
come chiede Expo, React Native 0.88.0 → 0.88.1, `react-native-screens` 4.30.1 e
`react-native-safe-area-context` 5.11.1 (solo correzioni, nessuna versione
grande). React Native si aggiorna a mano insieme a Expo (CLAUDE.md, §2): per
questo la versione è cambiata anche negli `overrides` di `pnpm-workspace.yaml`.
`pnpm dedupe` ha poi tolto le copie doppie rimaste nel lockfile.

Tolte da `osv-scanner.toml` le eccezioni di zod 3 e node-forge, non più
necessarie: osv-scanner ora le controlla di nuovo come tutte le altre.

**Verifica**: `pnpm audit` da 14 avvisi (7 gravi) a 1 basso (deepmerge, in
eccezione); `npx expo-doctor` 20/20; `npx expo export --platform android`
genera il pacchetto; build, typecheck, lint e test di tutto il monorepo.
