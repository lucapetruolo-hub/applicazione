# packages/shared: logica e tipi condivisi

Si carica quando Claude Code lavora in `packages/shared`. Testo da `CLAUDE.md`
§2 (10/11/2026).

- **Il sito usa i sorgenti di `packages/shared`** (alias in
  `apps/web/next.config.mjs`, `sideEffects: false`, docs/CHANGELOG.md §345):
  ogni pagina prende solo le parti che usa. Un modulo di `packages/shared`
  non deve contare su effetti al solo import (registrazioni, globali). L'API
  usa sempre `dist/`.
