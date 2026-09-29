# Regolamento per la risoluzione delle segnalazioni sui lavori — BOZZA

> **Bozza da far verificare a un avvocato prima della pubblicazione.**
> Non è pubblicata sul sito. Va inserita in `/termini` solo dopo l'approvazione
> dell'avvocato (checklist pre-lancio, CLAUDE.md §10, punto 11bis).
> Decisioni dell'utente del 29/09/2026 (docs/CHANGELOG.md §167). Tempistiche
> riprese dalla Garanzia dalla A alla Z di Amazon e adattate a un marketplace di
> servizi a domicilio.

## 1. Cosa si può segnalare e quando

Il cliente può segnalare un problema su un lavoro nato da una prenotazione
sul sito:

- **Il professionista non si è presentato.** Dalla fine dell'orario previsto
  e per 7 giorni, finché il cliente non ha confermato che il lavoro è
  terminato. Come prova basta la conversazione in chat, che il nostro team
  legge.
- **Il lavoro non è andato bene.** Dall'inizio dell'appuntamento e fino a 14
  giorni dopo il più recente di questi eventi: fine dell'appuntamento,
  chiusura del lavoro da parte del professionista, conferma del cliente. Il
  cliente deve allegare almeno una foto del lavoro.

Si può fare una sola segnalazione per ogni lavoro.

## 2. Fase 1 — Contatto diretto in chat (48 ore)

- Il professionista riceve subito la segnalazione. Ha **48 ore** per
  rispondere al cliente in chat e proporre una soluzione, per esempio
  tornare a sistemare il lavoro, fissare un nuovo appuntamento o fare uno
  sconto.
- Se si accordano, il cliente chiude la segnalazione ("Abbiamo risolto").
- Se il professionista risponde ma non c'è accordo, il cliente può passare
  la segnalazione al nostro team ("Non abbiamo risolto").
- Se il professionista **non risponde entro 48 ore**, la segnalazione passa
  automaticamente al nostro team.

## 3. Fase 2 — Esame del nostro team

1. **Versione del professionista (72 ore).** Da quando la segnalazione passa
   al nostro team, il professionista ha **72 ore** per inviare la sua
   versione e le prove: messaggi, orari, foto. Se non risponde, la
   segnalazione è **accolta automaticamente**.
2. **Richiesta di informazioni (72 ore).** Se le prove non bastano, il nostro
   team può chiedere altre informazioni al professionista, che ha **72 ore**
   per rispondere. Se non risponde, la segnalazione è **accolta
   automaticamente**.
3. **Decisione (2 giorni).** Quando le prove sono complete, il nostro team
   decide entro **2 giorni**. La decisione è motivata, usa esiti standard
   uguali per casi uguali e viene comunicata a entrambe le parti.

## 4. Esiti e misure

- **Respinta:** nessuna conseguenza per il professionista.
- **Accolta:**
  - l'affidabilità del professionista si abbassa e riceve meno richieste. Vale
    sia per la mancata presentazione sia per il lavoro fatto male;
  - scatta una misura progressiva, contando le segnalazioni accolte negli
    ultimi 30 giorni:
    1. prima segnalazione: **avvertimento**;
    2. seconda: profilo **più in basso** nella ricerca e nell'assegnazione
       delle richieste per **14 giorni**;
    3. terza o successiva: **nessuna nuova richiesta** per **14 giorni**. Il
       profilo esce dalla ricerca, ma i lavori già accettati restano attivi;
  - per una mancata presentazione, il cliente può inviare con un tasto la
    stessa richiesta ad altri professionisti della zona, escluso quello che
    non si è presentato;
  - **lavoro pagato sul sito con Stripe:** il cliente riceve il rimborso
    dell'importo pagato sul metodo di pagamento usato. L'importo viene
    ripreso dal conto Stripe del professionista (inversione del trasferimento
    Stripe Connect). Con il pagamento diretto al professionista non c'è
    rimborso da parte nostra: la decisione vale per le misure sul profilo e
    come elemento a favore del cliente.
- Dopo la decisione, o dopo un accordo in chat, il cliente può lasciare la
  recensione.

## 5. Ricorso del professionista (30 giorni)

Se una segnalazione è accolta, il professionista può fare ricorso **entro 30
giorni** e una sola volta, spiegando perché la decisione è sbagliata e che
prove ha. Il ricorso lo esamina un membro del nostro team **diverso** da chi
ha deciso.

Se il ricorso è accolto:
- la segnalazione diventa respinta;
- l'affidabilità torna com'era;
- la misura presa per quella segnalazione viene tolta;
- un rimborso non ancora eseguito viene annullato. Un rimborso già eseguito
  resta.

## 6. Natura della decisione e altre vie

- La decisione è uno strumento interno della piattaforma. **Non ha valore di
  sentenza e non vincola le parti.** Non impedisce di rivolgersi a un
  organismo di mediazione o conciliazione, a un'associazione dei
  consumatori o al giudice competente.
- Il cliente consumatore conserva tutti i diritti previsti dal Codice del
  Consumo verso il professionista che ha eseguito il lavoro.
- **Non indicare il link alla piattaforma europea ODR**: è stata abolita dal
  20/07/2025.
- Il servizio di risoluzione è gratuito per entrambe le parti.

## 7. Da verificare con l'avvocato

1. **Clausola "non rispondiamo di danni"** (`/termini` §6-§7). Va rivista:
   - è compatibile con il rimborso garantito sui pagamenti tramite sito?
   - è compatibile con i limiti degli artt. 33 e 36 del Codice del Consumo
     (clausole vessatorie verso il consumatore)?
2. **Decisione automatica a favore del cliente** quando il professionista non
   risponde in 72 ore: va bene come regola contrattuale verso il
   professionista (P2B, Reg. UE 2019/1150: motivazione, reclamo interno)?
3. **Rimborso con inversione del trasferimento** dal conto Stripe del
   professionista:
   - serve un consenso esplicito nel contratto con il professionista?
   - come si coordina con il ruolo fiscale di Manovia nell'intermediazione
     (checklist, punti 7-9)?
4. **Misure progressive** (abbassamento nel ranking, blocco delle nuove
   richieste): vanno descritte nei termini per i professionisti come
   condizioni di restrizione del servizio (P2B art. 4, DSA art. 14 e 17).
5. **Esenzione micro/piccola impresa** dal sistema interno di reclamo
   obbligatorio (DSA art. 19-21, P2B art. 11): conferma che si applica e che
   il ricorso interno descritto qui è volontario.
6. **Conservazione di chat e prove** (privacy): per quanto tempo le teniamo
   dopo la chiusura della segnalazione? Da allineare a
   `docs/registro-trattamenti.md`.
