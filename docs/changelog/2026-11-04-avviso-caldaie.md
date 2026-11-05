# Avviso "caldaie" nella scelta dei mestieri e mestieri che mancano al sito

**Richiesta** (Luca, 04/11/2026, thread "Chiarire l'iscrizione di un
termoidraulico"): dopo i nomi dei mestieri
(`2026-11-04-nomi-dei-mestieri.md`), le due migliorie proposte:
1. avvisare chi sceglie Idraulico che le richieste sulle caldaie arrivano a
   "Climatizzazione e caldaie";
2. imparare i nomi dei mestieri dalle ricerche vere. Luca ha chiesto anche
   come capire quali mestieri aggiungere al sito quando molti clienti
   cercano qualcosa che non c'è.

**Decisione**:
- `CATEGORY_COMPANIONS` in `packages/shared/src/categories.ts` e riquadro in
  `CategoryMultiPicker` (registrazione, profilo, Admin): con Idraulico scelto,
  Climatizzazione e caldaie non scelta e posto libero, "Lavori anche su
  caldaie e riscaldamento?" con il pulsante "Aggiungi".
- Una parola cercata che non è il nome di nessuna attività (per esempio
  "tappezziere") apre la pagina "Che lavoro ti serve?" invece di una lista
  vuota, e così finisce in Admin → Mestieri richiesti come le descrizioni.
  Prima queste ricerche non le vedeva nessuno.
- In Admin → Mestieri richiesti il riquadro "Cercati ma non capiti, ultimi
  30 giorni": le ricerche non capite raggruppate per testo, le più frequenti
  prima (al massimo 20), con "Insegna" che mette la parola nel campo per
  insegnarla al dizionario. Un mestiere che torna spesso e non c'è è il
  candidato da aggiungere (`PROFESSIONAL_CATEGORIES`).

**Verifica**: typecheck di API e sito, `pnpm --filter @professionisti/web
lint`, test di `src/problem-match` dell'API.
