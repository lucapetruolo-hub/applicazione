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

**Verifica:**
- `pnpm typecheck` e `pnpm lint` di `apps/web`;
- prova e2e `richiesta-preventivo.spec.ts` aggiornata alla frase nuova;
- foto su telefono e computer.
