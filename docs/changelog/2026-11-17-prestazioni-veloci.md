# 17/11/2026 — Prestazioni: perché aggiungerne tante, e più lavori insieme

**Richiesta di Luca** (thread "Facilitare l'inserimento delle prestazioni"):
far capire al professionista che ogni prestazione inserita lo fa trovare
quando un cliente cerca quel problema, così ne aggiunge il più possibile, e
rendere l'inserimento più veloce, per esempio con una casella dove scrivere
più lavori separati da virgola, a cui aggiungere solo il prezzo.

**Decisione.** Luca ha scelto la proposta A (foto in project-files
`anteprime/prestazioni-veloci/`) e ha detto sì a due migliorie: pillole
ordinate per quello che cercano i clienti e un promemoria in "Oggi".

- In cima a "Prestazioni offerte" una riga: "Ogni lavoro che aggiungi ti fa
  trovare. Quando un cliente descrive quel problema, compari prima di chi non
  lo offre." con "Scopri di più". È vero: nella ricerca partita dalla
  descrizione chi ha la prestazione corrispondente (`matchedServiceId`) va
  prima (`professionals.service.ts`) e il cliente la legge sulla scheda.
  Sotto, il numero di lavori aggiunti.
- **"Aggiungi più lavori insieme"**: separati da virgola, punto e virgola o a
  capo (un elenco incollato a righe diventa un elenco a virgole); Invio
  aggiunge. `splitServiceList` (`packages/shared/src/serviceNames.ts`) usa il
  nome del catalogo quando la voce ne è una variante nota
  (`canonicalServiceName`), toglie i doppioni e quelle già presenti, e
  rispetta il tetto di 30 prestazioni. Nessuna parola entra nel dizionario.
  Sul telefono la virgola non è nella prima schermata della tastiera
  italiana: basta anche un lavoro alla volta con Invio.
- **Righe compatte**: nome, prezzo ("60–150 € a lavoro" o "Prezzo su
  richiesta", come lo legge il cliente), "Modifica" / "+ Prezzo" e la X. Le
  caselle di unità e prezzo si aprono solo toccando, con "Fatto" per
  chiuderle. Le voci aggiunte ora hanno l'etichetta "Nuova". "+ Scrivi
  un'altra prestazione" apre subito la riga da scrivere.
- **Pillole "Più cercati dai clienti"**: in testa le prestazioni più cercate
  per quel mestiere negli ultimi 90 giorni (dal lancio), dalla descrizione del
  problema (`problem_descriptions.service`, almeno 2 ricerche). Nuovo
  `GET /service-names/searched` (solo con l'accesso, ricontato ogni 10
  minuti). Senza ricerche resta l'ordine di prima.
- **Promemoria in "Oggi"** a chi compare già nelle ricerche e ha meno di 3
  prestazioni: "Aggiungi i lavori che fai", pulsante "Aggiungi lavori".
- `/dashboard/profilo?campo=prestazioni` (e il vecchio
  `#profilo-prestazioni` del preventivo) apre il modulo sulle prestazioni con
  il cursore nella casella veloce: prima il link portava all'anteprima.
- Il codice della sezione è passato in
  `apps/web/src/app/dashboard/profilo/_components/ServicesEditor.tsx`.

**Scartato.** "Aggiungi tutte le più cercate" con un tocco: porterebbe in cima
alle ricerche chi non fa quel lavoro. Una sola casella con tutto l'elenco
modificabile come testo: correggendo un nome si perdeva il prezzo, e un nome
con una virgola si spezzava in due.

**Verifica.**
- Prove: `serviceNames.test.ts` (virgole, a capo, varianti, doppioni),
  `service-names.test.ts` dell'API (somma delle varianti, soglia, dieci
  minuti), `e2e/tests/preventivo-veloce.spec.ts` (dal preventivo il modulo si
  apre sulle prestazioni, axe sulla sezione).
- Foto prima/dopo da telefono e computer con un professionista di prova in
  `anteprime/prestazioni-veloci/`.
