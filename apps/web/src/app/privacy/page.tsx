import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Come trattiamo i tuoi dati personali su Professionisti.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updatedAt="2 settembre 2026"
      sections={[
        {
          heading: "1. Titolare del trattamento",
          body: "Il titolare del trattamento dei dati è [DA COMPILARE: ragione sociale, sede legale, P.IVA], contattabile all'indirizzo email [DA COMPILARE: email privacy]. Questa bozza va completata con i dati reali dell'azienda e verificata da un legale prima del lancio definitivo.",
        },
        {
          heading: "2. Dati che raccogliamo",
          body: "Raccogliamo i dati che ci fornisci direttamente: nome, indirizzo email, numero di telefono (se lo inserisci), città e indirizzo dell'intervento, descrizione del lavoro richiesto, eventuali foto o video caricati, e — per i professionisti — i dati del profilo pubblico (nome attività, categoria, zona, servizi e prezzi). Raccogliamo inoltre dati tecnici di navigazione (log, indirizzo IP, tipo di browser) necessari al funzionamento e alla sicurezza del servizio.",
        },
        {
          heading: "3. Perché trattiamo i tuoi dati (finalità e base giuridica)",
          body: "Trattiamo i dati per: (a) creare e gestire il tuo account (esecuzione del contratto); (b) metterti in contatto con i professionisti o con i clienti (esecuzione del contratto); (c) inviarti comunicazioni di servizio relative alle tue richieste e prenotazioni (esecuzione del contratto); (d) migliorare la piattaforma e garantirne la sicurezza (legittimo interesse); (e) adempiere obblighi di legge. Il conferimento dei dati di contatto è necessario per usare il servizio; senza di essi non possiamo inoltrare le richieste.",
        },
        {
          heading: "4. Con chi condividiamo i dati",
          body: "Condividiamo i dati strettamente necessari con: i professionisti a cui invii una richiesta (nome, contatti, dettagli del lavoro); i clienti, se sei un professionista (dati del tuo profilo pubblico); fornitori tecnici che ci aiutano a erogare il servizio (hosting, invio email, archiviazione immagini) nominati responsabili del trattamento. Non vendiamo i tuoi dati a terzi.",
        },
        {
          heading: "5. Conservazione",
          body: "Conserviamo i dati per il tempo necessario a fornire il servizio e adempiere gli obblighi di legge. Puoi chiedere la cancellazione del tuo account in qualsiasi momento: i dati saranno eliminati o anonimizzati, salvo quelli che dobbiamo conservare per legge.",
        },
        {
          heading: "6. I tuoi diritti",
          body: "Hai diritto di accedere ai tuoi dati, rettificarli, cancellarli, limitarne o opporti al trattamento, e alla portabilità. Puoi esercitarli scrivendo a [DA COMPILARE: email privacy]. Hai inoltre diritto di reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).",
        },
        {
          heading: "7. Trasferimenti extra-UE",
          body: "Alcuni fornitori tecnici (es. servizi cloud e di archiviazione immagini) possono trattare dati fuori dall'UE: in tal caso il trasferimento avviene con garanzie adeguate (decisioni di adeguatezza o clausole contrattuali standard).",
        },
      ]}
    />
  );
}
