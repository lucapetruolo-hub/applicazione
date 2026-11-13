# Tre prestazioni che mancavano

**Richiesta** (Luca, 13/11/2026, "si" alle proposte di
`analisi/prestazioni-ia/catalogo-nomi-da-unire.md`): aggiungere le prestazioni
che mancano nel catalogo, trovate con il banco delle prestazioni
(docs/changelog/2026-11-13-banco-prestazioni-esperto.md).

**Decisione**: nuove prestazioni suggerite in `POPULAR_SERVICES`, con i nomi
scritti in altro modo come varianti:
- Idraulico: "Riparazione scaldabagno elettrico" (lo scaldabagno elettrico è
  dell'idraulico, ma la riparazione c'era solo in Climatizzazione);
- Elettricista: "Riparazione citofono e videocitofono" (c'era solo
  l'installazione, e l'IA la dava per un citofono che non suona);
- Falegname: "Riparazione infissi in PVC e alluminio" (c'erano solo quelli in
  legno).
Da Admin non si possono aggiungere: il "+" vale solo per un nome già scritto
da un professionista. "Riparazione condizionatore" non serve: è già una
variante di "Assistenza guasti". Il banco ora unisce anche i nomi scritti in
altro modo quando legge il catalogo pubblico, come fa il sito.

Le etichette della pila di allenamento sono state aggiornate (5 frasi); la pila
di prova non ha frasi che cambiano.

**Verifica**: test di `packages/shared` e dell'API verdi; le varianti
("riparazione citofono", "Riparazione infissi in PVC") portano al nome nuovo,
"citofono" da solo resta "Installazione videocitofono".
