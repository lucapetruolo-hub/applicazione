# Backup e piano di emergenza

**Richiesta** (Luca, 13 e 16/11/2026, thread "Proteggere il progetto con
backup e piano di emergenza"): "un massimo esperto penserebbe che abbiamo
bisogno di un backup di tutto il progetto? Cos'altro suggerirebbe?", poi
"fai tu quello che si fa nel repo e dammi i passi per quello che devo fare io
nei miei account".

**Decisione**:
- `docs/ops/emergenza.md`: una sola pagina da aprire per prima quando qualcosa
  va storto (cosa è giù, rollback, ripristino, chiavi da cambiare e quella da
  non cambiare mai, chi avvisare: Garante entro 72 ore, persone colpite,
  registro delle violazioni). Rimanda alle guide che c'erano già.
- `docs/ops/protezione-account.md`: i passi a mano per Luca (database a
  pagamento, gestore di password con accesso di emergenza, verifica in due
  passaggi con app o passkey a partire da Gmail, carta di riserva, Time
  Machine e copia mensile del repo, dominio, prova di ripristino, registro
  dei trattamenti).
- Privacy, punto 5: nuova riga "Copie di sicurezza (backup)", fino a 30 giorni,
  cifrate e in UE. 30 e non 7 giorni per lasciare posto alla copia esterna
  settimanale proposta a Luca (ancora da decidere dove salvarla).
- Checklist di lancio, punti 28 e 29: rimandi alle due pagine.

Aggiornato lo stesso giorno: Luca ha deciso (thread sul traffico) che il
database resta Free fino alla società (gennaio 2027) e passa a Basic prima
del lancio. La guida ora dice di rifarlo Free entro il 05/12 e di non
mettere dati veri finché non ha backup.

**Motivo**: regola 3-2-1 (tre copie, due supporti, una fuori dal fornitore
principale). Il database era sul piano Free senza backup; le chiavi esistevano
solo su Render e Vercel; i passi per un incidente erano sparsi in tre guide e
mancava la parte GDPR (art. 33-34).

**Verifica**: `pnpm --filter @professionisti/web lint` e `typecheck`.
