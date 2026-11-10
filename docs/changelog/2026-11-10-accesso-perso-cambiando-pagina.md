# Accesso perso cambiando pagina (prova instabile del menu laterale)

**Richiesta** (Luca, 10/11/2026, thread "Sistemare il test instabile del menu laterale"): la prova del menu laterale su computer con l'orario di Tokyo falliva ogni tanto, anche sul ramo principale (l'ultima volta dopo la #287). Trovare la causa e renderla stabile senza indebolire il controllo.

**Causa**: non era la prova, era un difetto vero del sito. La prova "anche il cliente ha il menu laterale" apre la home, salva l'accesso del cliente e va su "Le mie richieste". Quando la home finiva di caricarsi proprio in quel momento, chiedeva all'API chi è la persona (`/auth/me`) e il cambio di pagina interrompeva la risposta a metà. `request()` di `packages/api-client` leggeva il corpo con `response.json().catch(() => null)`: la lettura interrotta diventava `null`, che per `/auth/me` vuol dire "account eliminato o accesso non valido", e `AuthContext.loadUser` cancellava il token dal browser. La pagina nuova trovava la persona uscita ("Accedi per vedere le tue richieste"). Fuso orario e date non c'entravano: il progetto di Tokyo è solo quello che gira su "computer", dove la home è più lenta a prepararsi. A una persona vera poteva capitare lo stesso: aprire un link mentre il sito controllava ancora l'accesso e ritrovarsi fuori dall'account.

**Decisione**:
- `readBody()` in `packages/api-client/src/client.ts` (usata da `request()` e dal caricamento dei file): legge il testo della risposta; vuoto o non JSON resta `null` come prima (`/auth/me` di un account eliminato risponde vuoto), una lettura interrotta si rilancia come errore di rete. `loadUser` già tratta gli errori di rete come "non si sa": il token resta e alla pagina dopo si riprova.
- Test veloci del pacchetto (`src/client.test.ts`, `pnpm --filter @professionisti/api-client test`, girano con `pnpm turbo run test` in CI): corpo vuoto, utente, lettura interrotta, errore dell'API.
- La prova nel browser non cambia: controlla ancora tutto il percorso vero.

**Verifica**: in locale (API, sito e Postgres come in CI) una prova che cambia pagina mentre la home chiede `/auth/me` perdeva l'accesso 11 volte su 28; con la correzione 0 su 40. Le prove del menu laterale passano su computer e telefono. Il test "lettura interrotta" fallisce senza la correzione e passa con.
