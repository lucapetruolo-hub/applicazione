# Rotella dell'ora: si trascina anche col mouse (19/11/2026)

**Richiesta** (Luca): la rotella degli orari in Agenda, quando il
professionista inserisce o modifica un orario, deve scorrere sia tenendo
premuto il mouse sia col dito da telefono, come su iPhone.

**Cosa c'era**: col dito scorreva già (è lo scorrimento del telefono, con lo
scatto sul numero). Al computer invece si girava solo con la rotella del mouse,
con un clic sul numero o con le frecce: tenendo premuto e trascinando non
succedeva niente.

**Decisione**: tenendo premuto il mouse su una colonna e trascinando, la
colonna segue il puntatore; al rilascio si ferma sul numero più vicino. Mentre
si trascina gli scatti sono sospesi (altrimenti la colonna salta) e il clic di
fine trascinamento non sceglie il numero sotto il puntatore. Vale per ogni
campo ora del sito, perché la rotella è una sola (`ItalianTimeInput`).

**Verifica**: prova `e2e/tests/campo-orario.spec.ts` (trascinamento al
computer, due numeri più avanti); typecheck e lint.
