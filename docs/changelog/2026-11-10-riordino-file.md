# Riordino dei file del progetto

**Richiesta** (Luca, 10/11/2026): sistemare meglio i file del progetto per
essere più ordinato e favorire la ricerca di Claude Code, con il prompt
riscritto da un esperto del settore.

**Decisione** (proposta approvata da Luca con il controllo CI):
- `CLAUDE.md` da 56 KB a circa 23 KB, **stesse sezioni §1-§10 con gli stessi
  numeri** (le citazioni "CLAUDE.md §N" nel codice restano valide). Spostato
  parola per parola: la tabella completa dello stack (§2) in
  `docs/architettura/stack.md`, §6-§8 in `docs/prodotto.md`, il riepilogo di
  §9 in fondo a `docs/STATO.md`. Le note tecniche di §2 divise nei `CLAUDE.md`
  di `apps/web` (con `@AGENTS.md`, così Claude Code legge anche le regole di
  Next.js 16), `apps/api`, `apps/mobile`, `packages/ui`, `packages/shared`,
  `packages/database`; le regole di Tamagui in
  `docs/architettura/interfaccia.md`, importato dai `CLAUDE.md` di sito, app e
  `packages/ui`. §4 ora ha la mappa delle cartelle. §5 non cambia.
- Nuovi indici: `docs/README.md` e `docs/indice-changelog.md` (le sezioni
  dell'archivio con il numero di riga).
- `AUDIT.md` spostato in `docs/archivio/2026-09-audit-fase0.md`, aggiornati i
  due commenti del codice che lo citavano.
- CI: il passo "Dimensione di CLAUDE.md" avvisa se supera i 25 KB.
- Cartella condivisa del progetto (fuori dal repo): `README.md` con le regole,
  `analisi/INDICE.md` per tema (file non spostati, sono citati ovunque),
  cinque cartelle di foto spostate in `anteprime/`.

**Motivo**: `CLAUDE.md` si rilegge a ogni messaggio; i dettagli servono solo
quando si lavora in quell'area, e un indice fa trovare un documento in due
passi.

**Verifica**: i 18 punti delle note tecniche di §2 sono tutti, identici, in
`docs/architettura/stack.md` e, tranne tre (build dei pacchetti, Node,
dipendenze, rimasti nella radice in forma breve), anche nel `CLAUDE.md` della
cartella o nella radice; nessun controllo della CI tolto o allentato.
