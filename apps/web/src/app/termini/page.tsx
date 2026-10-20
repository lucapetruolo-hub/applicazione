import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { OnlinePaymentsTermsNote } from "@/components/OnlinePaymentsTermsNote";
import { BRAND } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Termini di Servizio",
  description: `Le regole d'uso della piattaforma ${BRAND.name}.`,
};

export default function TerminiPage() {
  return (
    <LegalPage
      title="Termini di Servizio"
      updatedAt="14 ottobre 2026"
      sections={[
        {
          heading: `1. Cos'è ${BRAND.name}`,
          body: BRAND.name + " è una piattaforma che mette in contatto chi cerca un professionista per lavori alla casa (idraulici, elettricisti, imbianchini e altre categorie) con i professionisti iscritti. La piattaforma facilita il contatto e lo scambio di preventivi: il contratto di lavoro si conclude sempre e solo tra cliente e professionista, che restano gli unici responsabili dell'esecuzione e della qualità del lavoro. Il cliente può pagare il lavoro online sulla piattaforma, con le garanzie descritte al punto 5, oppure direttamente al professionista.",
        },
        {
          heading: "2. Account",
          body: "Per inviare richieste o offrire servizi serve un account gratuito. Sei responsabile della riservatezza delle tue credenziali e della veridicità dei dati inseriti. Ci riserviamo di sospendere account che violino questi termini, forniscano dati falsi o abusino del servizio.",
        },
        {
          heading: "3. Per i clienti",
          body: "Il servizio di ricerca e richiesta preventivi è gratuito. I preventivi ricevuti sono emessi dai professionisti, che ne sono gli unici responsabili: la piattaforma non garantisce prezzi, tempi o esiti dei lavori. Le recensioni possono essere pubblicate solo a seguito di lavori confermati attraverso la piattaforma, oppure dopo la chiusura di una segnalazione sul lavoro.",
        },
        {
          heading: "4. Per i professionisti",
          body: "Il professionista usa la piattaforma con un abbonamento mensile a livelli, che si distinguono per il numero di lavori accettati compresi ogni mese; il primo mese del livello Base è gratuito. L'abbonamento si rinnova automaticamente ogni mese, con un avviso alcuni giorni prima di ogni rinnovo, e si può annullare in qualsiasi momento: resta attivo fino alla scadenza del periodo già pagato. Alla fine del mese gratuito senza un livello scelto, alla fine dell'abbonamento o raggiunti i lavori compresi nel mese, il profilo non compare nelle ricerche e non riceve nuove richieste finché non si sceglie un livello, si passa al livello superiore pagando la differenza o inizia il mese successivo. Prezzi e condizioni sono indicati nella pagina dei piani (/per-professionisti). Il professionista dichiara di possedere i requisiti professionali e le autorizzazioni richieste dalla legge per la propria attività, ed è l'unico responsabile dei contenuti del proprio profilo e dei preventivi emessi. Salvando il profilo il professionista conferma una dichiarazione sulla veridicità dei dati inseriti (qualifiche, certificazioni, assicurazione RC, prezzi) e si impegna ad aggiornarli; la data e la versione della dichiarazione accettata vengono registrate. Certificazioni e assicurazione RC sono dichiarate dal professionista e non sono verificate dalla piattaforma: contenuti falsi possono essere rimossi e il profilo sospeso.",
        },
        {
          heading: "5. Pagamento dei lavori",
          id: "pagamenti",
          body: (
            <>
              <OnlinePaymentsTermsNote />
              {"Nel preventivo il professionista indica i modi di pagamento che accetta (pagamento online, acconto online con saldo diretto, pagamento diretto) e la percentuale dell'acconto online; accettando il preventivo il cliente sceglie tra questi. PAGAMENTO ONLINE: si paga con carta tramite Stripe, il fornitore dei servizi di pagamento della piattaforma. All'accettazione si versa un acconto pari alla percentuale dell'importo massimo del preventivo indicata dal professionista (20% se non indicata): il lavoro è confermato, e il professionista riceve i contatti del cliente, solo quando l'acconto risulta pagato; se nel frattempo il preventivo è cambiato o non è più disponibile, l'acconto viene rimborsato per intero; quando il professionista chiude il lavoro con l'importo finale si paga il saldo, cioè la differenza tra l'importo finale e quanto già versato (se l'acconto supera l'importo finale, la differenza viene restituita); se l'importo finale non supera il massimo del preventivo, il saldo viene addebitato in automatico sulla carta usata per l'acconto, altrimenti, o se l'addebito non riesce, il cliente lo paga con il link che riceve. ACCONTO ONLINE E SALDO DIRETTO: l'acconto si paga online come sopra e il saldo direttamente al professionista; le regole del pagamento online (blocco delle somme, commissione, assistenza e rimborso) valgono solo per l'acconto, quelle del pagamento diretto per il saldo. Le somme pagate online non restano alla piattaforma: il pagamento avviene direttamente sul conto di pagamento del professionista presso Stripe, che compare come venditore sull'estratto conto del cliente, e Stripe le accredita lì al netto del costo del servizio di pagamento Stripe e della commissione della piattaforma del 5%, entrambi a suo carico, che la piattaforma trattiene al momento del pagamento (finché il costo esatto della carta non è noto se ne trattiene il massimo e la differenza viene restituita al professionista); allo sblocco è a carico del professionista anche il costo di Stripe per il bonifico verso la sua banca (0,25% + 0,10 € a bonifico e 2 € nei mesi in cui riceve bonifici); il cliente non paga costi aggiuntivi. Sul conto del professionista le somme restano bloccate, senza poter essere trasferite sul suo conto bancario, finché il cliente non conferma che il lavoro è terminato, oppure fino a 7 giorni dopo la chiusura del lavoro se il cliente non conferma e non segnala problemi; con una segnalazione o una contestazione bancaria aperta restano bloccate fino alla sua chiusura. Allo sblocco la piattaforma avvia il bonifico verso il conto bancario del professionista. Per le regole di Stripe le somme non possono restare bloccate oltre 90 giorni dal pagamento: trascorso questo termine vengono comunque trasferite al professionista, che resta tenuto a restituire quanto dovuto in caso di annullamento o di segnalazione accolta. Il professionista autorizza la piattaforma a disporre, tramite Stripe, il blocco, lo sblocco e i bonifici verso la sua banca e i rimborsi al cliente. Le somme rimborsate al cliente o contestate dal cliente presso la sua banca Stripe le prende dal conto Stripe del professionista (le contestate all'apertura della contestazione, restituite se la banca dà ragione al professionista) e, se non bastano, dal suo conto bancario. Il professionista autorizza inoltre la piattaforma a prelevare dal suo conto Stripe le somme che le deve per i lavori (commissioni, costi e somme a suo carico in base a questi termini), con il costo del prelievo applicato da Stripe (1,4%) a suo carico; quanto non si può prelevare viene trattenuto dai suoi pagamenti online successivi. Se il saldo non viene pagato entro 7 giorni dalla chiusura, il professionista riceve quanto già versato e il nostro team contatta il cliente, che resta tenuto al pagamento e può vedere sospeso il proprio account. Se il lavoro viene annullato prima dell'esecuzione, l'acconto viene rimborsato per intero, ripreso dal conto Stripe del professionista. Con il pagamento online il cliente ha l'assistenza della piattaforma sulle segnalazioni (punto 6) e, se la segnalazione è accolta, il rimborso del 100%, del 50% o del 20% di quanto pagato secondo la gravità del problema; la somma rimborsata, la commissione della piattaforma e i costi del pagamento che Stripe non restituisce restano a carico del professionista. PAGAMENTO DIRETTO: il cliente paga il professionista come si accordano, fuori dalla piattaforma. In questo caso la piattaforma non riceve né custodisce somme, non effettua rimborsi e non decide sulle contestazioni: in caso di problemi mette in contatto cliente e professionista, che devono accordarsi direttamente tra loro; in ogni caso il cliente può lasciare la recensione."}
            </>
          ),
        },
        {
          heading: "6. Segnalazioni sui lavori",
          body: "Il cliente può segnalare che il professionista non si è presentato (dalla fine dell'appuntamento, entro 7 giorni) o che il lavoro non è andato bene (entro 14 giorni dalla sua conclusione, con almeno una foto). Il professionista ha 48 ore per rispondere in chat e proporre una soluzione. Per i lavori pagati online: se il professionista non risponde, o se cliente e professionista non si accordano, la segnalazione passa al nostro team; da quel momento il professionista ha 72 ore per inviare la propria versione e le prove, e altre 72 ore per le eventuali informazioni che gli chiediamo, altrimenti la segnalazione è accolta; con le prove complete decidiamo entro 2 giorni, con una motivazione comunicata a entrambi. Una segnalazione accolta comporta per il professionista, in base alle segnalazioni accolte negli ultimi 30 giorni: un avvertimento; poi un profilo più in basso nella ricerca e nell'assegnazione delle richieste per 14 giorni; poi l'impossibilità di ricevere nuove richieste per 14 giorni. Il professionista può fare ricorso una volta, entro 30 giorni dalla decisione: lo esamina una persona diversa da chi ha deciso. Per i lavori pagati direttamente la segnalazione resta tra cliente e professionista, senza decisione della piattaforma. Le nostre decisioni sono uno strumento interno, non hanno valore di sentenza e non impediscono a nessuna delle parti di rivolgersi a un organismo di mediazione o al giudice.",
        },
        {
          heading: "7. Contenuti caricati",
          body: "Foto, video e descrizioni caricati devono essere leciti, pertinenti e non violare diritti di terzi. Concedi alla piattaforma una licenza non esclusiva a usarli per fornire il servizio (es. mostrarli ai professionisti o sul tuo profilo). Possiamo rimuovere contenuti inappropriati.",
        },
        {
          heading: "8. Limitazione di responsabilità",
          body: "La piattaforma non è parte del contratto tra cliente e professionista. Fatto salvo quanto previsto ai punti 5 e 6 per i lavori pagati online (blocco delle somme, rimborsi e decisioni sulle segnalazioni) e fatti salvi i diritti riconosciuti al consumatore dalla legge, la piattaforma non risponde di danni, ritardi o lavori non conformi, che restano a carico del professionista. Non garantiamo la disponibilità continua del servizio.",
        },
        {
          heading: "9. Modifiche e legge applicabile",
          body: "Possiamo aggiornare questi termini: le modifiche saranno comunicate in piattaforma e l'uso continuato vale come accettazione. Vale la legge italiana; per i consumatori resta fermo il foro del luogo di residenza. Bozza da far verificare a un legale prima del lancio definitivo.",
        },
      ]}
    />
  );
}
