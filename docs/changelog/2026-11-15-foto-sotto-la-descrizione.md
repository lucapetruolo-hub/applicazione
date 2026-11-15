# 15/11/2026 — Foto per il professionista subito sotto la descrizione

**Richiesta di Luca.** Spostare lo spazio "Foto per il professionista" subito
sotto "Descrivi il lavoro" (miglioria proposta dopo
`2026-11-14-foto-per-il-professionista.md`).

**Motivo.** Sul telefono lo spazio stava dopo tutte le 14 categorie e "Quando
ti serve?". Così la foto della ricerca, già allegata, si vedeva solo
scorrendo fino in fondo. Ora sta dopo la descrizione e i suoi avvisi
(sicurezza, domanda), prima delle categorie.

**Cosa cambia** (`GuidedRequestForm.tsx`):
- lo spazio foto si sposta, senza altre modifiche;
- le frasi che indicano dove guardare seguono la nuova posizione:
  - "oppure aggiungi una foto qui sopra";
  - "Dalla foto ti suggeriamo …: l'abbiamo scelta qui sotto".

**Altre due richieste di Luca dello stesso giorno:**
- Via "(facoltative)" dal titolo "Foto per il professionista".
- **Scegliere la fotocamera.** Dal telefono "Aggiungi" (richiesta) e il tasto
  "Foto" (home) aprono un menu dal basso, `PhotoPicker.tsx`, con:
  - "Scatta una foto" (`capture="environment"`);
  - "Fai un video", solo nella richiesta;
  - "Scegli dalla galleria";
  - "Annulla".

  Il menu nativo senza `capture`, chiesto in passato, su Android non offre
  sempre la fotocamera. È lo stesso schema del menu allegati della chat. Dal
  computer si apre subito la scelta del file: lì una foto del guasto arriva
  dal telefono, non dalla webcam.

**Verifica:**
- `pnpm typecheck` e `pnpm lint` di `apps/web`;
- prova e2e `richiesta-preventivo.spec.ts` aggiornata alla frase nuova;
- foto su telefono e computer;
- Playwright: il menu si apre al tocco sul telefono, "Scegli dalla galleria"
  aggiunge la foto, "Scatta una foto" apre l'input con `capture`; dal
  computer nessun menu, si apre subito la scelta del file.
