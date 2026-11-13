# Pericoli dalla foto e avviso "l'IA può sbagliare" (13/11/2026)

**Richiesta** (Luca, thread "Stimare i costi della ricerca con foto"): dopo il
quarto giro del banco (`analisi/ricerca-foto/esito-banco-4.md` nella cartella
del progetto) l'IA vedeva i pericoli in modo instabile: 17 su 18 col testo,
10 su 13 con la sola foto (persi un quadro elettrico allentato, una caldaia,
un tubo del gas). Scelta di Luca sulla scheda: **"Riga leggera con impianti
visti"**. Poi: "dare comunque un avviso del tipo che l'IA dà suggerimenti e
può sbagliare, quindi controllare".

**Decisione**:
- L'IA, guardando la foto, dice anche quale **impianto** si vede (`impianto`:
  gas, elettrico, caldaia o nessuno), indipendentemente dal pericolo.
- Se c'è un impianto ma nessun pericolo, i risultati hanno `safetyHint` e il
  sito mostra una **riga leggera** chiusa: "Senti odore di gas, fumo o
  bruciato? Ecco cosa fare", che si apre sugli stessi passi dell'avviso
  (`PROBLEM_SAFETY_TEXTS`). Gas → avviso del gas, elettrico → elettrico,
  caldaia/stufa/camino → monossido. Con un pericolo vero resta solo l'avviso
  rosso, mai i due insieme.
- Motivo: l'avviso pieno ("esci, chiama il 112") su ogni foto di una caldaia
  spaventerebbe chi ha solo una perdita d'acqua; la riga chiusa costa poco e
  copre il caso in cui l'IA non vede il pericolo (meglio un avviso in più che
  uno in meno).
- Dizionario (`SAFETY_RULES` in `packages/shared/src/problemMatch.ts`): quadro,
  interruttore, salvavita o magnetotermico seguiti entro poche parole da
  allentato, si muove, traballa, scalda, scotta, ronza, sfrigola o crepita
  danno l'avviso elettrico anche dal solo testo.
- **Trasparenza sull'IA**: la riga piccola sotto il mestiere ora dice
  "Suggerimento dell'intelligenza artificiale: può sbagliare, controlla che sia
  il mestiere giusto. Come funziona" e compare **ogni volta** che il mestiere lo
  ha proposto l'IA: dal testo, dalla foto (anche quando il mestiere è uno degli
  altri proposti) o con un mestiere che il sito non ha. Prima compariva solo
  col primo mestiere della ricerca a testo. Mai quando decide il solo
  dizionario o quando il cliente sceglie a mano un mestiere fuori dalla
  proposta. Stessa frase nella richiesta guidata e nell'informativa privacy.
- `apps/api/scripts/banco-foto.mjs` registra la riga leggera (colonna
  `riga_leggera`) e conta un pericolo come coperto anche da quella, dicendo
  quanti solo così.

**Verifica**: test dell'API (`problem-photo.test.ts`: impianto senza pericolo
→ solo riga leggera; con pericolo → solo avviso; senza impianto → niente) e del
dizionario (`problemMatch.test.ts`: tre frasi sul quadro con l'avviso, "spostare
il quadro" senza). Il banco va rifatto dopo l'unione per misurare i pericoli
coperti.
