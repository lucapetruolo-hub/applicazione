# Preventivo con una voce sola: si legge il nome della voce

**Richiesta** (Luca, 24/11/2026, durante la prova con la carta 4242): "con
un'unica voce inserita dal professionista, nel preventivo ricevuto dal cliente
non esce la voce nel prezzo: bisogna correggere".

**Decisione**: nella scheda del preventivo del cliente
(`apps/web/src/app/le-mie-richieste/_components/QuoteCard.tsx`), con una voce
sola sotto il prezzo compare il **nome** della voce, senza l'importo. Da due
voci in su resta l'elenco con un importo per riga
(`2026-11-11-voci-prezzo-in-colonna.md`).

**Motivo**: il 05/11 la voce unica era stata tolta perché ripeteva la cifra
del totale (`2026-11-05-scheda-preventivo-semplice.md`), ma con la cifra era
sparito anche il nome: il cliente leggeva "80 - 120 €" e non per cosa. Il nome
serve per confrontare due preventivi e per non discutere dopo. La cifra resta
una sola.

**Verifica**: prova nuova in `e2e/tests/voci-prezzo-colonna.spec.ts` (nome
visibile, importo una volta sola), su telefono e computer.
