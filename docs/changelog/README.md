# Changelog: una voce per file

Dal 28/10/2026 ogni nuova voce di lavoro va in un file suo in questa cartella,
non più in fondo a `docs/CHANGELOG.md` (che resta l'archivio delle sezioni
§10-§399, da cercare con Grep come sempre).

**Perché**: tutte le PR scrivevano in fondo allo stesso file con il numero
successivo. Due PR aperte insieme andavano sempre in conflitto, e una PR in
conflitto non fa partire nessun controllo su GitHub: restava ferma finché il
thread non la riallineava, poi rifaceva tutti i controlli. In due giorni 1
giro della CI su 3 era solo un riallineamento
(`2026-10-28-controlli-pr-veloci.md`).

**Come**:
- Nome del file: `AAAA-MM-GG-argomento.md` (data del giorno, argomento in
  minuscolo con i trattini), per esempio `2026-10-28-controlli-pr-veloci.md`.
  Il nome è unico da solo: niente numeri da contendersi né da rinumerare.
- Contenuto: stesso formato di sempre (titolo `# ...`, **Richiesta**,
  **Decisione**, motivo, **Verifica**).
- Più giri sullo stesso lavoro nello stesso thread: si aggiorna lo stesso
  file o se ne aggiunge un altro con la data del giorno.
- Nel codice e nei commenti si cita il file:
  `docs/changelog/2026-10-28-controlli-pr-veloci.md`.

La CI avvisa se una PR aggiunge ancora una sezione numerata a
`docs/CHANGELOG.md` e blocca un file con il nome sbagliato.
