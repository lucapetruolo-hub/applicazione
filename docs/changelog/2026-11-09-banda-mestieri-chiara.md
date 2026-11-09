# Banda dei mestieri più chiara nei risultati del problema (09/11/2026)

**Richiesta di Luca:** dopo `2026-11-09-mestieri-proposti-pulsanti.md`, con "Muffa sul muro" la banda diceva "Ti serve un muratore / Di solito lo fa un muratore" sotto due pulsanti (Muratore 0, Imbianchino 1), con la domanda in un riquadro a parte. "Tutte e 4", senza mettere prima un mestiere solo perché ha più professionisti, perché potrebbe essere meno adatto. Poi: "non far limitare solo a due categorie, nei risultati ci potrebbe essere anche un tuttofare che ha aggiunto i servizi".

## Decisione (`apps/web/src/components/ProblemBand.tsx`)

1. Con più mestieri e nessuna scelta del cliente il titolo li nomina tutti: "Può servirti un muratore o un imbianchino". Dopo una risposta o un tocco su un pulsante torna "Ti serve un…".
2. La domanda sta nello stesso riquadro, subito sotto il titolo, con "Rispondi e ti mostriamo chi serve."; la risposta sceglie il mestiere.
3. Tolta la riga "Di solito lo fa…", che ripeteva il titolo: resta solo un motivo vero (quello dell'IA) e "In cima chi fa «…»".
4. Se il mestiere scelto non ha nessuno vicino: "Per ora nessuno vicino per Muratore e ristrutturazioni. Imbianchino: 1 vicino." con il link. L'ordine dei mestieri non cambia mai per i numeri.
5. Anche gli altri mestieri: se qualcuno di un altro mestiere (es. un tuttofare) ha questo lavoro tra le prestazioni, la banda dice "Più sotto anche N professionisti di altri mestieri che offrono questo lavoro", con il link alla sezione "Potrebbero fare anche questo lavoro" (già esistente, `#anche-questo-lavoro`).

## Verifica

- `typecheck` e `lint` del sito verdi.
- Pagina provata in locale con risposte finte (muratore 0, imbianchino 1, con domanda): titolo con i due mestieri, riga "Imbianchino: 1 vicino", domanda nel riquadro.
