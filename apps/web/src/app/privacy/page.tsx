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
      updatedAt="2 ottobre 2026"
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
          body: "Trattiamo i dati per: (a) creare e gestire il tuo account (esecuzione del contratto); (b) metterti in contatto con i professionisti o con i clienti (esecuzione del contratto); (c) inviarti comunicazioni di servizio relative alle tue richieste e prenotazioni (esecuzione del contratto); (d) migliorare la piattaforma e garantirne la sicurezza e la qualità: a questo scopo le conversazioni tra clienti e professionisti sulla piattaforma possono essere lette dal nostro personale autorizzato, per esempio per gestire segnalazioni, contestazioni o abusi, e ogni lettura viene registrata (legittimo interesse); (e) adempiere obblighi di legge. Il conferimento dei dati di contatto è necessario per usare il servizio; senza di essi non possiamo inoltrare le richieste.",
        },
        {
          heading: "4. Con chi condividiamo i dati",
          body: "Condividiamo i dati strettamente necessari con: i professionisti a cui invii una richiesta (descrizione del lavoro e città; nome, telefono, email e indirizzo solo dopo che hai accettato un preventivo); i clienti, se sei un professionista (dati del tuo profilo pubblico). Ci aiutano a erogare il servizio, come responsabili del trattamento, questi fornitori: Render (server e database), Vercel (sito web e statistiche di visita anonime, senza cookie), Cloudinary (foto e video caricati), Resend (invio delle email), Google (accesso con Google, mappe, suggerimenti e ricerca degli indirizzi), Sentry (segnalazione degli errori tecnici del server, senza indirizzo IP né cookie), Cloudflare (controllo anti-bot quando crei un account con email e password, chiedi una nuova password o ci scrivi dalla pagina Contatti, senza cookie di profilazione) e, quando attivi i pagamenti online, Stripe (pagamenti con carta). Le mappe e i servizi Google vengono caricati nel tuo browser solo dopo il tuo consenso. Non vendiamo i tuoi dati a terzi.",
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
          body: "Alcuni dei fornitori elencati al punto 4 hanno sede o server negli Stati Uniti: Render, Vercel, Cloudinary, Resend, Google, Sentry, Cloudflare e Stripe. Il trasferimento avviene con garanzie adeguate: la decisione di adeguatezza UE-USA (Data Privacy Framework) per i fornitori che vi aderiscono, altrimenti le clausole contrattuali standard approvate dalla Commissione europea. Puoi chiederci copia delle garanzie scrivendo all'indirizzo del punto 1.",
        },
      ]}
    />
  );
}
