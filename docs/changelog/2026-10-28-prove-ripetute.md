# Prove nel browser ripetute una volta nella CI

**Richiesta** (Luca, 28/10/2026, thread "Sistemare i controlli falliti su GitHub"): controllare i giri falliti su GitHub. Il ramo principale era verde; l'unico rosso dal 25/10 era una prova del menu laterale su computer (26/10, dopo la #146): il menu non era comparso entro 10 secondi dopo il ricaricamento, mentre le altre 139 prove erano passate e nei giri dopo è sempre passata anche lei. Luca ha approvato di ripetere le prove che falliscono, "se non rende il lavoro più pericoloso per bug".

**Decisione**:
- Nella CI una prova nel browser che fallisce si ripete una volta (`retries: process.env.CI ? 1 : 0` in `e2e/playwright.config.ts`); in locale mai.
- Una prova passata solo al secondo tentativo non sparisce: `e2e/reporters/ripetute.ts` la mostra come avviso giallo nella PR e nel riepilogo del giro, con l'errore del primo tentativo. Se la stessa prova torna più volte è un bug da cercare.
- Mai ripetute le prove sulle richieste nello stesso istante (`agenda-doppie-prenotazioni.spec.ts`, `preventivo-accettato.spec.ts`, `retries: 0` nel file): lì un errore che capita solo a volte è proprio il bug che cercano.
- Un errore vero fallisce due volte e il controllo resta rosso come prima.

**Verifica**: in locale con una prova finta che fallisce al primo tentativo: passa al secondo, compare come avviso e nel riepilogo; la stessa prova con `retries: 0` resta rossa. `tsc` di `e2e` pulito.
