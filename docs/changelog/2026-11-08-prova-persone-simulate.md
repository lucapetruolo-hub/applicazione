# Correzioni dalla prova con persone simulate

**Richiesta di Luca (08/11/2026)**: «Effettua tutti i punti e tutti i testi
tranne il n.4 e il n.15» del rapporto della prova con sette persone simulate
del 07/11/2026 (`collaudo/2026-11-07-persone-simulate/rapporto.md` nella
cartella del progetto). Esclusi: punto 4 (nome del professionista che si
spezza a 320 px) e punto 15 (quanto arriva al professionista mentre prepara
il preventivo). Il punto 5 (/per-professionisti "il lavoro si conferma solo a
pagamento") era assegnato al thread "Prendere spunti dalla homepage di
miodottore", che poi l'ha lasciato a questo lavoro: fatto qui, con la frase
anti no-show.

## Cosa cambia

**Pagamento nel preventivo (punti 1, 2, 10, 18)**
- Il blocco "Pagamento" ora dice «Puoi pagare in due modi:» con i modi
  numerati, ognuno col suo titolo ("Con la carta, sul sito", "Acconto con la
  carta, il resto direttamente a lui", "Direttamente al professionista, in
  contanti o con bonifico") e sotto le cifre: «24,00 € adesso con la carta, il
  resto (da 56,00 € a 96,00 €) a lavoro finito con la stessa carta»
  (`quotePaymentSplitLine`, `quotePaymentRestText` in
  `packages/shared/src/onlinePayments.ts`, `PaymentChoice.tsx`).
- Il riepilogo prima di "Accetta e paga" dice che il resto si paga con la
  stessa carta in automatico quando il professionista chiude il lavoro
  (Codice del consumo art. 49: prima lo diceva solo Stripe).
- Con più modi di pagamento nessuno è scelto di serie (regole sulle scelte
  guidate, DSA art. 25): il pulsante dice "Scegli come pagare" finché il
  cliente non sceglie. Con un solo modo resta già scelto.
- Lo stesso totale si chiama sempre "Prezzo" (prima "Tutto compreso",
  "Totale · Tutto compreso", "Totale stimato").

**Stripe solo carta (punto 14)**: nei due pagamenti del lavoro
(`online-money.service.ts`) `payment_method_types: ["card"]`, come
l'abbonamento: Revolut Pay, iDEAL e Bancontact non tengono la carta per il saldo.

**Barra del pagamento del cliente (punto 9)**: "Pagato → In attesa della tua
conferma → Al professionista" al posto di "Bloccato" (lato professionista resta).

**Richiesta di preventivo (punti 6, 8, 20, 23)**
- "Quando ti serve?" una volta sola: al primo passo, dopo gli orari e solo se
  non se n'è scelto uno (il giorno dice già quando serve); non più nel
  riepilogo (si legge nella riga del lavoro e si cambia con "Modifica"); su
  /urgente non si chiede, è già "Oggi".
- Passo "Dove": «Il professionista vede subito solo il tuo nome. Cognome,
  telefono e via li vede quando accetti un preventivo.»
- Finestra dell'email: "Quasi fatto" / "La tua email" (prima "Un ultimo
  passo" con "Passo 1 di 2").
- Dopo un errore del primo passo il cursore va sul campo da correggere
  (descrizione, categorie o "Quando ti serve?"), non resta su "Avanti".

**Professionisti (punti 5, 7, 16, 17)**
- /per-professionisti: «Con l'acconto, il lavoro si fissa quando paga» e
  «Se chiedi l'acconto online, il lavoro è fissato solo dopo che il cliente ha
  pagato.»; "Promemoria via email, così il cliente non si dimentica".
- Iscrizione: un solo contatore dei passi obbligatori (in Oggi "1 di 3 fatti"
  quando il profilo è salvato), la barra dei passi segue il passo vero, tolto
  "Parte 1 di 2" dentro Dati fiscali.
- Limite dei 2.000 € online: «Finora: 1 lavoro pagato online.»
- Oggi: "Nessuna ancora" al posto di "Visite 0, media della zona 0", tempo di
  risposta "meno di 1 min" invece di "0 min", "Vedi i lavori terminati". I
  riquadri "In arrivo" del boost restano (decisione già presa, §349).

**Badge (punti 12, 13)**
- "Partita IVA": «Può farti la fattura: lavora in proprio con partita IVA.»
- "Nuovo profilo" diventa "Iscritto da poco".
- Nel preventivo il segno delle novità non lette si chiama "Da leggere":
  accanto a "Partita IVA" "Nuovo" sembrava un professionista nuovo.
- Nella lista del professionista niente "Nuovo" su lavori annullati,
  terminati, scaduti o chiusi.

**Home su telefono (punto 11)**: con il campo che sale (PR #256) la lista si
chiudeva già scegliendo o toccando fuori; ora scegliendo "Ti serve: …" senza
città il cursore passa a Città (`SearchBar.tsx`).

**Indirizzo dei risultati (punto 19)**: verificato sul sito, non è un
problema: dalla home si va a `/cerca?problema=…&citta=…` e "Indietro" torna
alla home.

**Accessibilità (punti 21, 22, 24, 25)**
- Account: il campo città si chiama "Città" per il lettore di schermo.
- Frecce dei giorni nelle schede della ricerca e nella pagina del
  professionista: sempre pulsanti, spenti con `aria-disabled` (axe
  `aria-prohibited-attr`).
- Scheda "A domicilio/Online" attiva in verde pieno (#128552): il contrasto
  col bianco passa da 3,6 a 4,7.
- Orari dell'agenda a 14 px (prima 12 e 10,5 sulla scheda, 10,5 e 9,5 sul
  profilo): se la fascia non sta su una riga va a capo dopo il trattino.
  Sulle schede della ricerca, sul telefono (fino a 660 px), 3 giorni invece
  di 4 (miglioria scelta da Luca lo stesso giorno): la fascia sta su una riga
  dai telefoni da 375 px, va a capo solo su quelli da 320.
  Caselle del modo di pagamento nel preventivo del professionista a 22 px.
- Per un professionista senza profilo salvato abbonamento e verifiche non
  si chiedono più al server (prima due "non trovato" a ogni pagina,
  `apps/web/src/lib/myProfessionalProfile.ts`); senza nome la foto
  dell'account mostra la prima lettera dell'email, non "PR" da
  "prova.persone…".
- «Scegli un orario libero» (prima "Tocca", anche su computer).

**Testi della tabella**
- Piè di pagina: "Privacy", "Termini", "Cookie"; banner dei cookie: "Scopri
  di più" al posto di "Cookie Policy".
- Risultati: "Come è ordinato l'elenco" (anche nei Termini, che citano la
  finestra).
- Account: "Scarica i tuoi dati" / "Scarica" (anche nell'informativa privacy).
- Profilo: "Presentazione" al posto di "Bio"; Prestazioni: «Scrivi i lavori
  che fai e, se vuoi, il prezzo. Per esempio: da 50 a 100 € a lavoro. I
  clienti lo vedono nella ricerca.»; dichiarazione al salvataggio in una
  frase («Con "Salva profilo" confermi che i dati sono veri e che puoi fare
  questi lavori.») con "Leggi tutto" che apre il testo intero, che resta
  quello accettato (`PROFILE_DECLARATION_TEXT`, stessa versione).
- Preventivo: «Quello di partenza lo cambi nel Profilo.»
- Notifiche: "Avviso sullo schermo".

**Professionisti di prova (punto 3)**: cinque profili "lavoro occasionale" a
Latina (elettricista, imbianchino, falegname, un secondo idraulico,
giardiniere), con prestazioni e prezzi e tre con l'agenda, presentazione
"Account di prova per i collaudi del sito: non è un professionista vero".
Elenco e password in `analisi/identita/account-prova.md` della cartella del
progetto; da segnare "Non contare" in Admin e cancellare prima del lancio.

## Verifica

- `typecheck` di `packages/ui`, `apps/web`, `apps/api`; `pnpm lint` del sito.
- Prove di `packages/shared` (65) e dell'API (1.285), con le frasi nuove del
  pagamento in `quotePaymentSplit.test.ts` e `online-limit.test.ts`.
- Prove nel browser aggiornate: `richiesta-urgente.spec.ts` (domanda solo al
  primo passo, cursore sulla domanda dopo l'errore, /urgente senza domanda),
  `bollini-telefono.spec.ts` ("Iscritto da poco").
- Home e ricerca provate sul sito vero da telefono (iPhone SE): cursore a
  Città dopo il suggerimento, indirizzo dei risultati; axe su /cerca prima
  della correzione per trovare frecce e contrasto.
