import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { OnlinePaymentsTermsNote } from "@/components/OnlinePaymentsTermsNote";

export const metadata: Metadata = {
  title: "Termini di Servizio",
  description: "Le regole d'uso della piattaforma Professionisti.",
};

export default function TerminiPage() {
  return (
    <LegalPage
      title="Termini di Servizio"
      updatedAt="29 settembre 2026"
      sections={[
        {
          heading: "1. Cos'è Professionisti",
          body: "Professionisti è una piattaforma che mette in contatto chi cerca un professionista per lavori alla casa (idraulici, elettricisti, imbianchini e altre categorie) con i professionisti iscritti. La piattaforma facilita il contatto e lo scambio di preventivi: il contratto di lavoro si conclude sempre e solo tra cliente e professionista, che restano gli unici responsabili dell'esecuzione e della qualità del lavoro. Il cliente può pagare il lavoro online sulla piattaforma, con le garanzie descritte al punto 5, oppure direttamente al professionista.",
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
          body: (
            <>
              <OnlinePaymentsTermsNote />
              {"Accettando un preventivo il cliente sceglie come pagare. PAGAMENTO ONLINE: si paga con carta tramite Stripe, il fornitore dei servizi di pagamento della piattaforma. All'accettazione si versa un acconto pari al 20% dell'importo massimo del preventivo; quando il professionista chiude il lavoro con l'importo finale si paga il saldo, cioè la differenza tra l'importo finale e quanto già versato (se l'acconto supera l'importo finale, la differenza viene restituita). Le somme restano in custodia sulla piattaforma e passano al professionista quando il cliente conferma che il lavoro è terminato, oppure 7 giorni dopo la chiusura del lavoro se il cliente non conferma e non segnala problemi; con una segnalazione aperta restano bloccate fino alla sua chiusura. Al professionista viene accreditato l'importo al netto del costo del servizio di pagamento Stripe e della commissione della piattaforma del 5%, entrambi a suo carico; il cliente non paga costi aggiuntivi. Se il saldo non viene pagato entro 7 giorni dalla chiusura, il professionista riceve quanto già versato e il nostro team contatta il cliente, che resta tenuto al pagamento e può vedere sospeso il proprio account. Se il lavoro viene annullato prima dell'esecuzione, l'acconto viene rimborsato. Con il pagamento online il cliente ha l'assistenza della piattaforma sulle segnalazioni (punto 6) e, se la segnalazione è accolta, il rimborso di quanto pagato. PAGAMENTO DIRETTO: il cliente paga il professionista come si accordano, fuori dalla piattaforma. In questo caso la piattaforma non riceve né custodisce somme, non effettua rimborsi e non decide sulle contestazioni: in caso di problemi mette in contatto cliente e professionista, che devono accordarsi direttamente tra loro; in ogni caso il cliente può lasciare la recensione."}
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
          body: "La piattaforma non è parte del contratto tra cliente e professionista. Fatto salvo quanto previsto ai punti 5 e 6 per i lavori pagati online (custodia delle somme, rimborsi e decisioni sulle segnalazioni) e fatti salvi i diritti riconosciuti al consumatore dalla legge, la piattaforma non risponde di danni, ritardi o lavori non conformi, che restano a carico del professionista. Non garantiamo la disponibilità continua del servizio.",
        },
        {
          heading: "9. Modifiche e legge applicabile",
          body: "Possiamo aggiornare questi termini: le modifiche saranno comunicate in piattaforma e l'uso continuato vale come accettazione. Vale la legge italiana; per i consumatori resta fermo il foro del luogo di residenza. Bozza da far verificare a un legale prima del lancio definitivo.",
        },
      ]}
    />
  );
}
