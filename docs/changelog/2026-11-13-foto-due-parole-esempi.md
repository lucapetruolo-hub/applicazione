# Ricerca con foto: due parole dopo il tempo scaduto ed esempi prato e muro (13/11/2026)

**Richiesta** (Luca, "si" alle migliorie 2 e 3 di `analisi/ricerca-foto/esito-banco-5.md`
nella cartella del progetto, thread "Stimare i costi della ricerca con foto").

**Decisione**:
- Con la sola foto, se l'IA non risponde in tempo o è occupata ("spenta"), la
  foto non si scarta più con "scrivi il problema": resta scelta, il cursore va
  nel campo "Cosa è successo?" e il messaggio dice "Con la sola foto ora non ci
  riusciamo. Scrivi due parole sul problema e tocca di nuovo Cerca: guardiamo
  la foto insieme alle parole." Al quinto giro del banco è successo 1 volta su 237.
- Istruzioni della foto: un muro crepato, bagnato o con l'intonaco gonfio senza
  un tubo o un rubinetto che perde in vista è del muratore, poi idraulico; buchi,
  buche, terra smossa o avvallamenti nel prato o nel terreno sono del
  giardiniere, anche se li ha fatti un animale. Erano gli errori che tornavano a
  ogni giro (f027, f028, f063, f077, f081 muro con idraulico; f118 e f120 prato
  senza mestiere).

**Verifica**: typecheck, lint e test della ricerca con foto. L'effetto degli
esempi si misura al prossimo giro del banco, se servirà.
