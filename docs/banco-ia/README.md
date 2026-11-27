# Banco di prova dell'IA

Regola (docs/changelog/2026-11-27-il-sito-impara.md, miglioria 2 scelta da
Luca il 27/11/2026): **prima di cambiare le istruzioni dell'IA si rifà il
banco, e si unisce solo se il risultato non scende.** La CI lo fa ricordare:
`scripts/controlla-banco-ia.mjs` calcola l'impronta delle istruzioni (modello,
istruzioni della ricerca a parole e con foto, regole e istruzioni delle
proposte in Admin) e vuole una riga con quell'impronta in [esiti.md](esiti.md).

## Due banchi

1. **Banco fisso**, prima di unire: frasi e foto etichettate a mano. Le frasi
   prese dai forum e le foto non stanno nel repo (repo pubblico): sono nella
   cartella del progetto.
2. **Banco vero**, dopo il deploy: gli errori veri dell'IA, raccolti ogni notte
   nel database (tabella `ai_bank_cases`, mai nel repo perché sono testi dei
   clienti, già senza contatti). Si rifà da solo ogni domenica sera e ogni
   notte in cui le istruzioni sono cambiate; se le istruzioni nuove sbagliano
   di più arriva un avviso e la frase rossa in Admin → Proposte dell'IA.
   Le regole nuove dell'Admin invece si provano sul banco vero **prima** di
   essere proposte: si propongono solo se migliorano.

## Come si rifà il banco fisso

API in locale con la chiave dell'IA (nei thread cloud `BANCO_ANTHROPIC_KEY`
passata come `ANTHROPIC_API_KEY`), prima sul ramo principale e poi sul ramo
con le istruzioni nuove:

- Ricerca a parole, 100 frasi del repo:
  `node apps/api/scripts/banco-ia.mjs packages/shared/test-data/banco-problemi.csv - uscita.csv http://localhost:3001 --prestazioni=packages/shared/test-data/banco-prestazioni.csv`
- Ricerca a parole, 376 frasi dubbie: `banco-ia.mjs` con
  `analisi/abbinamento-problema/frasi/frasi-etichettate.csv` e
  `misura-ia/da-provare.txt` della cartella del progetto.
- Ricerca con foto: `node apps/api/scripts/banco-foto.mjs` con
  `analisi/ricerca-foto/foto-grezze/` della cartella del progetto.
- Proposte in Admin: `analisi/admin-automatico/banco/prova-ia-banca.ts` (40
  casi con le risposte di Luca) e `prova-ia-soldi.ts`.

Poi `node scripts/controlla-banco-ia.mjs --stampa` dà l'impronta: una riga in
[esiti.md](esiti.md) con data, impronta, cosa è cambiato, prima e dopo.
