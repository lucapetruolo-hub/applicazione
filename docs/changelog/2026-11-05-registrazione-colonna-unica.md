# Iscrizione dei professionisti: colonna unica, prestazioni per mestiere, Partita IVA

**Richieste** (Luca, 05/11/2026):
1. "Nella registrazione dal sito del professionista non mi piace la schermata divisa, valuta le migliorie."
2. "Nelle prestazioni offerte in fase di registrazione dividile per la categoria che si è scelto in precedenza, così non si crea caos."
3. "Nella sezione Partita IVA non dargli suggerimenti di inserimento, ma digli solo se è corretta o meno."
4. "Dove c'è scritto «Con Partita IVA» dagli la possibilità di modificarlo."

Proposte con foto in `anteprime/registrazione-schermata-divisa/` (cartella del
progetto): A colonna unica, B vantaggi sopra al passo 1, C foto in testa alla
scheda. **Luca ha scelto A.**

**Decisioni**:

1. **Colonna unica anche sul computer**: tolte foto e vantaggi accanto alla
   scheda (`ProfessionalSignupLayout`), scheda larga 560 px invece di 480, così
   le tessere dei mestieri respirano. Tolta la foto `registrati-elettricista.webp`,
   non più usata. Sul telefono non cambia nulla (era già una colonna).
2. **Prestazioni divise per mestiere** nel profilo (`/dashboard/profilo`, anche
   il primo dopo l'iscrizione): con più mestieri un riquadro per ognuno, con
   icona e colore del mestiere, le prestazioni aggiunte, "Le più richieste" di
   quel mestiere (4 in vista più "Altre") e "+ Scrivi un'altra prestazione".
   Con un solo mestiere resta una lista senza riquadro. "Consulenza online" va
   col mestiere principale.
   - Nuovo campo `ProfessionalService.categorySlug` (migrazione
     `20261105110000_service_category_slug`): il server lo salva solo se è un
     mestiere del profilo. Le prestazioni di prima (senza mestiere) vanno nel
     mestiere che le suggerisce, altrimenti nel principale, e al primo
     salvataggio prendono il mestiere.
   - Sul telefono unità, prezzi e "X" stanno su una riga sola sotto al nome
     (prima andavano a capo su tre righe), classi `service-*` in `globals.css`.
3. **Partita IVA**: mentre si scrive nessuna indicazione ("ne hai scritte 5",
   "solo numeri"). Il giudizio arriva a 11 cifre o uscendo dal campo: "Partita
   IVA corretta" in verde con la spunta (nuova prop `success` di `Field`) oppure
   "La partita IVA non è corretta." in rosso. Finché è a metà conta come
   mancante ("Manca: Partita IVA"), non come errore. I controlli del server non
   cambiano.
4. **Tipo modificabile in Dati fiscali**: accanto a "Con Partita IVA" (o
   Privato, Azienda) c'è "Cambia", che riapre le tre scelte. Come per "Cambia
   tipo" dell'admin, non dopo aver collegato Stripe: il pulsante non c'è e il
   server rifiuta il cambio (`entity-type-change.test.ts`). Il cambio del tipo
   toglie il "Verificato" come già prima (persona cambiata). Il testo della
   registrazione "Puoi cambiarlo dopo da Dati fiscali" ora è vero. Icone del
   tipo uguali a quelle della registrazione.

**Verifica**: `pnpm typecheck` e `pnpm lint` di `apps/web`, `tsc` e test di
`apps/api` (professional-fiscal, professionals); sito (build di produzione) e
API in locale con un database vuoto: iscrizione con due mestieri, prestazioni
aggiunte nei due riquadri, salvataggio con il mestiere (un mestiere non del
profilo torna `null`), Partita IVA a metà, sbagliata e giusta, "Cambia" del
tipo. Foto a 1440 px e iPhone 13 in `anteprime/registrazione-schermata-divisa/dopo/`.
