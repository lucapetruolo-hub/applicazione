# Prove nel browser ripetute una volta nella CI

**Richiesta** (Luca, 28/10/2026, thread "Sistemare i controlli falliti su GitHub"): controllare i giri falliti su GitHub. Il ramo principale era verde; l'unico rosso dal 25/10 era una prova del menu laterale su computer (26/10, dopo la #146): il menu non era comparso entro 10 secondi dopo il ricaricamento, mentre le altre 139 prove erano passate e nei giri dopo è sempre passata anche lei. Luca ha approvato di ripetere le prove che falliscono, "se non rende il lavoro più pericoloso per bug".

**Decisione**:
- Nella CI una prova nel browser che fallisce si ripete una volta (`retries: process.env.CI ? 1 : 0` in `e2e/playwright.config.ts`); in locale mai.
- Una prova passata solo al secondo tentativo non sparisce: `e2e/reporters/ripetute.ts` la mostra come avviso giallo nella PR e nel riepilogo del giro, con l'errore del primo tentativo. Se la stessa prova torna più volte è un bug da cercare.
- Mai ripetute le prove sulle richieste nello stesso istante (`agenda-doppie-prenotazioni.spec.ts`, `preventivo-accettato.spec.ts`, `retries: 0` nel file): lì un errore che capita solo a volte è proprio il bug che cercano.
- Un errore vero fallisce due volte e il controllo resta rosso come prima.

**Verifica**: in locale con una prova finta che fallisce al primo tentativo: passa al secondo, compare come avviso e nel riepilogo; la stessa prova con `retries: 0` resta rossa. `tsc` di `e2e` pulito.

## Seconda parte (28/10, migliorie approvate da Luca)

- **Uptime**: il controllo di API e sito riprova fino a 5 volte, ogni 15 secondi e per al massimo 2 minuti (prima 2 volte in 20 secondi). Il 25/10 Render aveva risposto "troppe richieste" (429) per una ventina di secondi e il controllo era diventato rosso senza che il sito fosse giù. Verifica: in locale `curl` con le stesse opzioni su un server finto che risponde 429 tre volte e poi 200 passa al quarto tentativo.
- **Errore interno nel test dei permessi** (`findComuneByName` su una città mancante, in `PUT /professionals/me`): non è un bug del sito. Lo provoca il test stesso, che di proposito lascia passare un corpo non valido fino al servizio (`apps/api/scripts/access-matrix.mjs`, per vedere se la rotta è protetta e non fermarsi al 400). Nell'API vera `ZodValidationPipe` risponde 400 a un profilo senza città (provato: `professionalProfileSelfSchema.safeParse({})` non passa). Nessuna modifica.
