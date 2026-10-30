import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSummary } from "@/components/LegalPage";
import { OnlinePaymentsTermsNote } from "@/components/OnlinePaymentsTermsNote";
import { BRAND, TERMS_CHANGES, formatTermsDate } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Termini di Servizio",
  description: `Le regole d'uso della piattaforma ${BRAND.name}.`,
  alternates: { canonical: "/termini" },
};

export default function TerminiPage() {
  return (
    <LegalPage
      title="Termini di Servizio"
      updatedAt="30 ottobre 2026"
      intro={
        <LegalSummary
          points={[
            `${BRAND.name} mette in contatto clienti e professionisti: il lavoro lo concordi e lo paghi al professionista, che ne risponde.`,
            "Per i clienti cercare e chiedere preventivi è gratis; pagando online hai il nostro aiuto e il rimborso se una segnalazione è accolta.",
            "I professionisti pagano un abbonamento a livelli e, sui pagamenti online, una trattenuta del 7% più IVA.",
            "Recensioni solo da lavori confermati; chiunque può segnalare un contenuto, anche senza account.",
            "Se cambiamo questi termini ti avvisiamo per email 15 giorni prima, e puoi chiudere l'account senza costi.",
          ]}
        />
      }
      sections={[
        {
          heading: `1. Cos'è ${BRAND.name}`,
          body: BRAND.name + " è una piattaforma che mette in contatto chi cerca un professionista per lavori alla casa (idraulici, elettricisti, imbianchini e altre categorie) con i professionisti iscritti. La piattaforma facilita il contatto e lo scambio di preventivi: il contratto di lavoro si conclude sempre e solo tra cliente e professionista, che restano gli unici responsabili dell'esecuzione e della qualità del lavoro. Il cliente può pagare il lavoro online sulla piattaforma, con le garanzie descritte al punto 5, oppure direttamente al professionista.",
        },
        {
          heading: "2. Account",
          body: "Per inviare richieste o offrire servizi serve un account gratuito. Sei responsabile della riservatezza delle tue credenziali e della veridicità dei dati inseriti. Possiamo sospendere un account che violi questi termini, fornisca dati falsi o abusi del servizio: ti scriviamo per email il motivo e come contestarlo (per i professionisti vedi anche il punto 10). Puoi chiudere il tuo account quando vuoi da Impostazioni.",
        },
        {
          heading: "3. Per i clienti",
          body: "Il servizio di ricerca e richiesta preventivi è gratuito. I preventivi ricevuti sono emessi dai professionisti, che ne sono gli unici responsabili: la piattaforma non garantisce prezzi, tempi o esiti dei lavori. Le recensioni possono essere pubblicate solo a seguito di lavori confermati attraverso la piattaforma, oppure dopo la chiusura di una segnalazione sul lavoro.",
        },
        {
          heading: "4. Per i professionisti",
          body: "Il professionista usa la piattaforma con un abbonamento a livelli, che si distinguono per il numero di lavori accettati compresi ogni mese. Mesi gratuiti: il professionista che si registra mentre è attiva un'offerta di mesi gratuiti ha il livello Base gratuito per il numero di mesi indicato dall'offerta (periodi di 30 giorni), a partire dal lancio della piattaforma o dalla registrazione se successiva; l'offerta può essere cambiata o sospesa in qualsiasi momento per le registrazioni successive, mentre chi è già registrato conserva i propri mesi. Per usare i mesi gratuiti il professionista indica una carta di pagamento, che il gestore dei pagamenti verifica senza addebito; senza la carta, dopo il lancio, il profilo non compare nelle ricerche. Alla fine dei mesi gratuiti parte in automatico l'abbonamento Base mensile al prezzo indicato, con un avviso alcuni giorni prima, salvo annullamento. Se durante i mesi gratuiti il professionista passa a un livello superiore, paga subito il prezzo mensile del nuovo livello diminuito del prezzo mensile del livello Base; da quel giorno inizia un nuovo periodo di un mese e i mesi gratuiti non ancora iniziati restano a disposizione del professionista, che li usa tornando al livello Base. L'abbonamento è mensile; i prezzi sono IVA esclusa e l'IVA si aggiunge in fattura; i lavori compresi si contano per periodi di un mese che partono dal giorno di attivazione e ripartono a ogni rinnovo; sui livelli Plus e Pro più lavori dello stesso cliente nello stesso periodo contano come uno. L'abbonamento si rinnova automaticamente alla fine di ogni mese, con un avviso alcuni giorni prima di ogni rinnovo, e si può annullare in qualsiasi momento: resta attivo fino alla scadenza del periodo già pagato. Con un abbonamento a pagamento il professionista può passare a un livello superiore in qualsiasi momento: paga subito una quota di 10 € più la differenza di prezzo tra i due livelli per la parte del periodo che manca al rinnovo, maggiorata del 10% (IVA esclusa). Il nuovo livello vale da subito e al rinnovo si paga il prezzo intero del nuovo livello. Può anche chiedere di tornare al livello Base dalla scadenza del periodo già pagato. Alla fine dei mesi gratuiti senza un abbonamento attivo o alla fine dell'abbonamento il profilo non compare nelle ricerche e non riceve nuove richieste finché non si sceglie un livello. Raggiunti i lavori compresi nel periodo il profilo resta nelle ricerche e riceve le richieste, ma non può inviare nuovi preventivi né rispondere per primo a una richiesta finché non passa al livello superiore o non inizia il periodo successivo; i preventivi già inviati restano validi. Prezzi e condizioni sono indicati nella pagina dei piani (/per-professionisti). Il professionista dichiara di possedere i requisiti professionali e le autorizzazioni richieste dalla legge per la propria attività, ed è l'unico responsabile dei contenuti del proprio profilo e dei preventivi emessi. Salvando il profilo il professionista conferma una dichiarazione sulla veridicità dei dati inseriti (qualifiche, certificazioni, assicurazione RC, prezzi) e si impegna ad aggiornarli; la data e la versione della dichiarazione accettata vengono registrate. Certificazioni e assicurazione RC sono dichiarate dal professionista e non sono verificate dalla piattaforma: contenuti falsi possono essere rimossi e il profilo sospeso.",
        },
        {
          heading: "5. Pagamento dei lavori",
          id: "pagamenti",
          body: (
            <>
              <OnlinePaymentsTermsNote />
              {"Nel preventivo il professionista indica i modi di pagamento che accetta (pagamento online, acconto online con saldo diretto, pagamento diretto) e la percentuale dell'acconto online; accettando il preventivo il cliente sceglie tra questi. Online il professionista può chiedere al massimo 2.000 € per lavoro, tra acconto e saldo, finché non ha completato 10 lavori pagati online senza contestazioni bancarie, il primo da almeno 120 giorni; la piattaforma può togliere prima questo limite e lo ripristina se il professionista perde una contestazione bancaria. PAGAMENTO ONLINE: si paga con carta tramite Stripe, il fornitore dei servizi di pagamento della piattaforma. All'accettazione si versa un acconto pari alla percentuale dell'importo massimo del preventivo indicata dal professionista (20% se non indicata): il lavoro è confermato, e il professionista riceve i contatti del cliente, solo quando l'acconto risulta pagato; se nel frattempo il preventivo è cambiato o non è più disponibile, l'acconto viene rimborsato per intero; quando il professionista chiude il lavoro con l'importo finale si paga il saldo, cioè la differenza tra l'importo finale e quanto già versato (se l'acconto supera l'importo finale, la differenza viene restituita); se l'importo finale non supera il massimo del preventivo, il saldo viene addebitato in automatico sulla carta usata per l'acconto, altrimenti, o se l'addebito non riesce, il cliente lo paga con il link che riceve. ACCONTO ONLINE E SALDO DIRETTO: l'acconto si paga online come sopra e il saldo direttamente al professionista; le regole del pagamento online (blocco delle somme, commissione, assistenza e rimborso) valgono solo per l'acconto, quelle del pagamento diretto per il saldo. Le somme pagate online non restano alla piattaforma: il pagamento avviene direttamente sul conto di pagamento del professionista presso Stripe, che compare come venditore sull'estratto conto del cliente, e Stripe le accredita lì al netto della commissione della piattaforma, pari al 7% più IVA di quanto pagato online, a carico del professionista, che la piattaforma trattiene al momento del pagamento e che comprende la commissione Stripe per il pagamento e quella per i bonifici verso la sua banca (se l'importo finale è più basso di quanto pagato, la commissione in più gli viene restituita allo sblocco); ogni mese la piattaforma emette al professionista la fattura delle commissioni trattenute e degli eventuali costi a suo carico in base a questi termini, con l'IVA; il cliente non paga costi aggiuntivi. La ricevuta di Stripe conferma il pagamento ma non è un documento fiscale: la fattura o la ricevuta del lavoro la rilascia il professionista, che ne è l'unico responsabile; il cliente può chiederla accettando il preventivo o dopo, e la piattaforma trasmette al professionista i dati che il cliente indica. Sul conto del professionista le somme restano bloccate, senza poter essere trasferite sul suo conto bancario, finché il cliente non conferma che il lavoro è terminato, oppure fino a 7 giorni dopo la chiusura del lavoro se il cliente non conferma e non segnala problemi; con una segnalazione o una contestazione bancaria aperta restano bloccate fino alla sua chiusura. Allo sblocco la piattaforma avvia il bonifico verso il conto bancario del professionista. Per le regole di Stripe le somme non possono restare bloccate oltre 90 giorni dal pagamento: trascorso questo termine vengono comunque trasferite al professionista, che resta tenuto a restituire quanto dovuto in caso di annullamento o di segnalazione accolta. Il professionista autorizza la piattaforma a disporre, tramite Stripe, il blocco, lo sblocco e i bonifici verso la sua banca e i rimborsi al cliente. Le somme rimborsate al cliente o contestate dal cliente presso la sua banca Stripe le prende dal conto Stripe del professionista (le contestate all'apertura della contestazione, restituite se la banca dà ragione al professionista) e, se non bastano, dal suo conto bancario. Il professionista autorizza inoltre la piattaforma a prelevare dal suo conto Stripe le somme che le deve per i lavori (commissioni, costi e somme a suo carico in base a questi termini), con il costo del prelievo applicato da Stripe (1,4%) a suo carico; quanto non si può prelevare viene trattenuto dai suoi pagamenti online successivi. Se il saldo non viene pagato entro 7 giorni dalla chiusura, il professionista riceve quanto già versato e il nostro team contatta il cliente, che resta tenuto al pagamento e può vedere sospeso il proprio account. Se il lavoro viene annullato prima dell'esecuzione, l'acconto viene rimborsato per intero, ripreso dal conto Stripe del professionista. Con il pagamento online il cliente ha l'assistenza della piattaforma sulle segnalazioni (punto 6) e, se la segnalazione è accolta, il rimborso del 100%, del 50% o del 20% di quanto pagato secondo la gravità del problema; la somma rimborsata e la commissione della piattaforma restano a carico del professionista, e così la commissione di Stripe, più IVA, su una contestazione bancaria persa per un lavoro non eseguito o non conforme. PAGAMENTO DIRETTO: il cliente paga il professionista come si accordano, fuori dalla piattaforma. In questo caso la piattaforma non riceve né custodisce somme, non effettua rimborsi e non decide sulle contestazioni: in caso di problemi mette in contatto cliente e professionista, che devono accordarsi direttamente tra loro; in ogni caso il cliente può lasciare la recensione."}
            </>
          ),
        },
        {
          heading: "6. Segnalazioni sui lavori",
          body: "Il cliente può segnalare che il professionista non si è presentato (dalla fine dell'appuntamento, entro 7 giorni) o che il lavoro non è andato bene (entro 14 giorni dalla sua conclusione, con almeno una foto). Il professionista ha 48 ore per rispondere in chat e proporre una soluzione. Per i lavori pagati online: se il professionista non risponde, o se cliente e professionista non si accordano, la segnalazione passa al nostro team; da quel momento il professionista ha 72 ore per inviare la propria versione e le prove, e altre 72 ore per le eventuali informazioni che gli chiediamo, altrimenti la segnalazione è accolta; con le prove complete decidiamo entro 2 giorni, con una motivazione comunicata a entrambi. Una segnalazione accolta comporta per il professionista, in base alle segnalazioni accolte negli ultimi 30 giorni: un avvertimento; poi un profilo più in basso nella ricerca e nell'assegnazione delle richieste per 14 giorni; poi l'impossibilità di ricevere nuove richieste per 14 giorni. Il professionista può fare ricorso una volta, entro 30 giorni dalla decisione: lo esamina una persona diversa da chi ha deciso. Per i lavori pagati direttamente la segnalazione resta tra cliente e professionista, senza decisione della piattaforma. Le nostre decisioni sono uno strumento interno, non hanno valore di sentenza e non impediscono a nessuna delle parti di rivolgersi a un organismo di mediazione o al giudice.",
        },
        {
          heading: "7. Contenuti caricati",
          body: "Profili, recensioni, richieste, foto, video e descrizioni devono essere leciti, veritieri, pertinenti e non violare diritti di terzi. Sono vietati in particolare insulti, minacce e contenuti discriminatori, dati personali di altre persone, recensioni non basate su un'esperienza reale, informazioni false o ingannevoli, spam e pubblicità non pertinente. Concedi alla piattaforma una licenza non esclusiva a usarli per fornire il servizio (es. mostrarli ai professionisti o sul tuo profilo). I contenuti che violano queste regole possono essere limitati o rimossi come descritto al punto 8.",
        },
        {
          // DSA art. 14 c. 1 (docs/CHANGELOG.md §319): regole della moderazione e della contestazione.
          heading: "8. Segnalazioni dei contenuti",
          id: "segnalazioni",
          body: "Chiunque può segnalare un contenuto: con il tasto \"Segnala\" su profili, recensioni e richieste oppure, anche senza account, dal link \"Segnala un contenuto illegale\" in fondo a ogni pagina. Chi segnala un contenuto come illegale spiega perché e conferma di farlo in buona fede. Ogni segnalazione è esaminata da una persona del nostro team, senza sistemi automatici. Le misure, scelte in proporzione alla gravità, sono: un avvertimento, la richiesta di correggere il contenuto, nascondere il contenuto, togliere il profilo dalla ricerca e dalla pagina pubblica, sospendere l'account. Chi segnala riceve la conferma di presa in carico e, se ha segnalato un contenuto illegale, l'esito della decisione. Chi ha pubblicato il contenuto riceve per email la misura, la regola o la legge violata e il motivo, senza il nome di chi ha segnalato, e può contestare la decisione dal link nell'email per almeno 6 mesi: la riesamina una persona del nostro team. Resta sempre possibile rivolgersi al giudice. Le segnalazioni fatte in malafede possono portare alla sospensione dell'account. Se un contenuto fa sospettare un reato che mette in pericolo la vita o la sicurezza di qualcuno, informiamo le autorità.",
        },
        {
          heading: "9. Limitazione di responsabilità",
          body: "La piattaforma non è parte del contratto tra cliente e professionista. Fatto salvo quanto previsto ai punti 5 e 6 per i lavori pagati online (blocco delle somme, rimborsi e decisioni sulle segnalazioni) e fatti salvi i diritti riconosciuti al consumatore dalla legge, la piattaforma non risponde di danni, ritardi o lavori non conformi, che restano a carico del professionista. Non garantiamo la disponibilità continua del servizio.",
        },
        {
          // Regolamento UE 2019/1150 (P2B), artt. 3, 4, 5, 7, 9 e 11: collaudo
          // del 29/10/2026, M-05 (docs/changelog/2026-10-30-termini-privacy-obblighi.md).
          heading: "10. Per i professionisti: ordine dei risultati, sospensione e dati",
          id: "professionisti",
          body: (
            <>
              {"ORDINE DEI RISULTATI: Nella ricerca per mestiere e città i profili sono ordinati così: prima chi ha un pacchetto di visibilità a pagamento attivo, mostrato con l'etichetta \"Sponsorizzato\"; poi la valutazione media più alta; a parità, il numero di recensioni; a parità di tutto, il più vicino al luogo cercato. I pacchetti a pagamento non contano quando il cliente parte dalla descrizione del problema e nello smistamento delle richieste. Il livello dell'abbonamento non cambia l'ordine. Un professionista con più segnalazioni accolte negli ultimi 30 giorni va in fondo per 14 giorni (punto 6). La stessa spiegazione è nella finestra \"Ordinato per pertinenza\" della ricerca. "}
              {"CHI COMPARE: Compaiono nella ricerca e ricevono richieste i profili con i dati fiscali compilati, non in pausa (mese gratuito finito senza un livello scelto, o abbonamento concluso) e non sospesi; un codice fiscale o una partita IVA risultati non validi tolgono il profilo dalla ricerca finché non vengono corretti. Prima del primo preventivo serve la verifica dell'identità (documento e selfie). "}
              {"TRATTAMENTI DIVERSI: Le regole sono le stesse per tutti i professionisti, con queste differenze: il pacchetto di visibilità (sopra); il numero di lavori compresi nel livello dell'abbonamento (punto 4); il limite di 2.000 € per lavoro chiesti online per chi è nuovo, finché non ha 10 lavori pagati online senza contestazioni e 120 giorni dal primo (punto 5). "}
              {"SOSPENSIONE E CHIUSURA: Se limitiamo o sospendiamo il tuo profilo ti scriviamo per email, al più tardi quando la misura parte, il motivo, i fatti e la regola di questi termini su cui si basa, e come contestarla; la contestazione la esamina una persona del nostro team. Se decidiamo di chiudere definitivamente il tuo account ti avvisiamo per email con il motivo almeno 30 giorni prima, salvo un obbligo di legge, una violazione ripetuta di questi termini o un rischio per la sicurezza dei clienti (per esempio una truffa o dati falsi). "}
              {"DATI: Vedi nella tua area i dati del tuo profilo e della tua attività: richieste ricevute, preventivi, lavori, pagamenti online, documenti, visite al profilo e confronto con la media della zona. I dati di contatto del cliente li ricevi solo quando accetta un tuo preventivo, e li usi solo per quel lavoro. Usiamo i dati dei professionisti per far funzionare la piattaforma, per la sicurezza e, solo in forma di numeri complessivi senza nomi, per migliorarla; non li vendiamo e non li diamo ad altri professionisti. Dopo la chiusura dell'account restano solo i dati che dobbiamo conservare per legge (vedi la Privacy Policy). "}
              {"RECLAMI: Per un reclamo sull'uso della piattaforma scrivici dalla pagina Contatti, scegliendo \"Sono un professionista\": ti rispondiamo per email."}
            </>
          ),
        },
        {
          // Codice del consumo artt. 49, 52 e 59: M-02 del collaudo. Bozza per
          // l'avvocato (domande 42 e 72); la scheda del preventivo la
          // collega il gruppo 3 del collaudo.
          heading: "11. Diritto di recesso dei clienti",
          id: "recesso",
          body: "Il contratto per il lavoro lo concludi con il professionista, che lo esegue e ne risponde (punto 1). Se sei un consumatore e il professionista lavora con partita IVA o come azienda, hai in genere 14 giorni dall'accettazione del preventivo per recedere senza dare motivi: basta dirlo al professionista in chat o annullare il lavoro dalla richiesta. Se chiedi che il lavoro inizi prima dei 14 giorni, per esempio con un appuntamento già fissato, e il lavoro viene completato, il recesso non c'è più; se recedi a lavoro iniziato paghi la parte già fatta. Per le riparazioni urgenti chieste da te il recesso non si applica. Il recesso non vale verso chi lavora come privato, in modo occasionale e senza partita IVA (indicato con \"Privato\" sul profilo), perché non è un professionista per il Codice del consumo. Fuori dai casi di recesso, l'annullamento segue il preavviso indicato nel preventivo e le regole dell'acconto (punto 5). Bozza da far verificare a un legale prima del lancio definitivo.",
        },
        {
          heading: "12. Modifiche ai termini",
          id: "modifiche",
          body: "Possiamo cambiare questi termini per adeguarli alla legge, per motivi di sicurezza o quando cambiamo i servizi o i prezzi della piattaforma. Ti avvisiamo per email e con un avviso sul sito almeno 15 giorni prima che le modifiche valgano, dicendo cosa cambia; se una modifica ti chiede di fare qualcosa di nuovo, il preavviso è più lungo. Se non sei d'accordo puoi chiudere l'account prima di quella data, senza costi; l'abbonamento già pagato resta valido fino alla scadenza. Il preavviso non serve per una modifica imposta dalla legge o da un'autorità, o per affrontare un pericolo urgente (per esempio una truffa). Le modifiche non cambiano i preventivi già accettati e i lavori in corso.",
        },
        {
          heading: "13. Legge applicabile",
          body: "Vale la legge italiana; per i consumatori resta fermo il foro del luogo di residenza e restano sempre i diritti che la legge del loro paese gli riconosce. Bozza da far verificare a un legale prima del lancio definitivo.",
        },
        {
          heading: "Versioni dei termini",
          id: "versioni",
          body: "Ogni cambio dei termini, con la data da cui vale e cosa cambia:",
          after: (
            <LegalList
              items={[...TERMS_CHANGES].reverse().map((change) => ({
                title: `Dal ${formatTermsDate(change.effectiveAt)}`,
                rows: [
                  ["Pubblicata", formatTermsDate(change.publishedAt)],
                  ["Cosa cambia", change.summary.join(" ")],
                ],
              }))}
            />
          ),
        },
      ]}
    />
  );
}
