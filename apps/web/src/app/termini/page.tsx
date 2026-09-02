import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Termini di Servizio",
  description: "Le regole d'uso della piattaforma Professionisti.",
};

export default function TerminiPage() {
  return (
    <LegalPage
      title="Termini di Servizio"
      updatedAt="2 settembre 2026"
      sections={[
        {
          heading: "1. Cos'è Professionisti",
          body: "Professionisti è una piattaforma che mette in contatto chi cerca un professionista per lavori alla casa (idraulici, elettricisti, imbianchini e altre categorie) con i professionisti iscritti. La piattaforma facilita il contatto e lo scambio di preventivi: il contratto di lavoro si conclude sempre e solo tra cliente e professionista, che restano gli unici responsabili dell'esecuzione, della qualità e del pagamento del lavoro.",
        },
        {
          heading: "2. Account",
          body: "Per inviare richieste o offrire servizi serve un account gratuito. Sei responsabile della riservatezza delle tue credenziali e della veridicità dei dati inseriti. Ci riserviamo di sospendere account che violino questi termini, forniscano dati falsi o abusino del servizio.",
        },
        {
          heading: "3. Per i clienti",
          body: "Il servizio di ricerca e richiesta preventivi è gratuito. I preventivi ricevuti sono emessi dai professionisti, che ne sono gli unici responsabili: la piattaforma non garantisce prezzi, tempi o esiti dei lavori. Le recensioni possono essere pubblicate solo a seguito di lavori confermati attraverso la piattaforma.",
        },
        {
          heading: "4. Per i professionisti",
          body: "Il profilo pubblico è gratuito (piano Free); alcune funzionalità avanzate possono essere offerte a pagamento con piani dedicati, i cui prezzi e condizioni sono indicati nella pagina dei piani. Il professionista dichiara di possedere i requisiti professionali e le autorizzazioni richieste dalla legge per la propria attività, ed è l'unico responsabile dei contenuti del proprio profilo e dei preventivi emessi.",
        },
        {
          heading: "5. Contenuti caricati",
          body: "Foto, video e descrizioni caricati devono essere leciti, pertinenti e non violare diritti di terzi. Concedi alla piattaforma una licenza non esclusiva a usarli per fornire il servizio (es. mostrarli ai professionisti o sul tuo profilo). Possiamo rimuovere contenuti inappropriati.",
        },
        {
          heading: "6. Limitazione di responsabilità",
          body: "La piattaforma è un intermediario tecnico: non siamo parte del contratto tra cliente e professionista e non rispondiamo di danni, ritardi, lavori non conformi o mancati pagamenti. Non garantiamo la disponibilità continua del servizio.",
        },
        {
          heading: "7. Modifiche e legge applicabile",
          body: "Possiamo aggiornare questi termini: le modifiche saranno comunicate in piattaforma e l'uso continuato vale come accettazione. Vale la legge italiana; per i consumatori resta fermo il foro del luogo di residenza. Bozza da far verificare a un legale prima del lancio definitivo.",
        },
      ]}
    />
  );
}
