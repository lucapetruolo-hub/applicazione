# apps/web: regole del sito

Si carica quando Claude Code lavora in `apps/web`. Le regole generali sono
nel `CLAUDE.md` della radice; il testo qui sotto viene da lì (§2, 10/11/2026).

@AGENTS.md
@../../docs/architettura/interfaccia.md

## Note tecniche

- **Next.js 16** (docs/changelog/2026-11-02-nextjs-16.md, prima Next.js 15
  §297): le pagine le prepara **Turbopack**, non più webpack; gli alias
  (`react-native` → `react-native-web`, sorgenti di `packages/shared`) e
  l'ordine delle estensioni `.web.*` stanno in `turbopack` di
  `next.config.mjs`. L'ingresso nascosto all'admin è in `src/proxy.ts` (il
  vecchio `middleware.ts`); niente runtime `edge`, deprecato. `next build`
  non fa più il lint: lo fa `pnpm lint` in CI. Nelle pagine server `params` e
  `searchParams` (come `cookies()` e `headers()`) sono Promise da attendere;
  il `typecheck` di `apps/web` esegue prima `next typegen`, che genera i tipi
  con cui si controllano le props delle pagine. Sito e app usano la stessa
  versione di React 19, fissata con `overrides` in `pnpm-workspace.yaml`
  (§299): aggiornandola, cambiarla lì e nei `package.json` di `apps/web` e
  `apps/mobile` insieme. Prima e dopo un aggiornamento importante
  `pnpm --filter @professionisti/web confronto-pagine` fotografa tutte le
  pagine e confronta i due giri pixel per pixel (istruzioni in testa a
  `apps/web/scripts/confronto-pagine.mjs`). Per zod, `src/zod.ts` di
  `packages/shared` tiene i messaggi d'errore di zod 3 (lo importa ogni file con
  schemi, unico con effetti in `sideEffects`; gli schemi importano `z` da "zod", e `apps/web` usa i sorgenti di
  shared, non `dist/`, per non caricare nel browser tutto zod) e `pnpm --filter @professionisti/shared confronto-zod` confronta
  le validazioni prima/dopo un aggiornamento, anche da solo nelle PR che
  cambiano la versione di zod (`.github/workflows/zod.yml`, docs/CHANGELOG.md §326).
- **Il sito usa i sorgenti di `packages/shared`** (alias in
  `apps/web/next.config.mjs`, `sideEffects: false`, docs/CHANGELOG.md §345):
  ogni pagina prende solo le parti che usa. Un modulo di `packages/shared`
  non deve contare su effetti al solo import (registrazioni, globali). L'API
  usa sempre `dist/`.
- **React Compiler** acceso su tutto il sito (docs/CHANGELOG.md §345), ma
  rompe gli stili `<style jsx>`: ogni componente che li usa deve iniziare
  con la direttiva `"use no memo"` (lo controlla `pnpm lint`,
  `apps/web/scripts/controlla-style-jsx.mjs`).
