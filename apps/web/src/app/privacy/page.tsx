import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { BRAND } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Come trattiamo i tuoi dati personali su ${BRAND.name}.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updatedAt="15 ottobre 2026"
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
          body: "Condividiamo i dati strettamente necessari con: i professionisti a cui invii una richiesta (descrizione del lavoro e città; nome, telefono, email e indirizzo solo dopo che hai accettato un preventivo); i clienti, se sei un professionista (dati del tuo profilo pubblico). Ci aiutano a erogare il servizio, come responsabili del trattamento, questi fornitori: Render (server e database), Vercel (sito web e statistiche di visita anonime, senza cookie), Cloudinary (foto e video caricati), Resend (invio delle email), Google (accesso con Google, mappe, suggerimenti e ricerca degli indirizzi), Sentry (segnalazione degli errori tecnici del server, senza indirizzo IP né cookie), Cloudflare (controllo anti-bot quando crei un account con email e password, chiedi una nuova password o ci scrivi dalla pagina Contatti, senza cookie di profilazione) e, quando attivi i pagamenti online, Stripe (pagamenti con carta). Per i professionisti, il controllo dei dati fiscali e dell'identità passa anche da Openapi e Didit (vedi il punto 8). Le mappe e i servizi Google vengono caricati nel tuo browser solo dopo il tuo consenso. Non vendiamo i tuoi dati a terzi.",
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
        {
          id: "verifica-identita",
          heading: "8. Verifica dei professionisti (dati fiscali, documento e selfie)",
          body: `Per proteggere i clienti verifichiamo chi lavora sulla piattaforma. (a) Dati fiscali: quando un professionista salva codice fiscale e partita IVA, verifichiamo la partita IVA con VIES, il servizio gratuito della Commissione europea, e, se VIES non la conferma, il codice fiscale e la partita IVA all'Agenzia delle Entrate e al Registro Imprese tramite Openapi S.p.A. (Italia), responsabile del trattamento; conserviamo solo l'esito (valido, non valido, attiva o cessata) e la ragione sociale ufficiale. Base giuridica: obbligo di legge (DAC7, D.Lgs. 32/2023) e legittimo interesse alla sicurezza della piattaforma. (b) Documento e selfie: prima di inviare il primo preventivo il professionista (per un'azienda, il legale rappresentante) fotografa un documento d'identità e fa un breve selfie con Didit Identity S.L. (Unione europea), responsabile del trattamento. Il confronto del volto con la foto del documento è un trattamento di dati biometrici (art. 9 GDPR) e avviene solo con il tuo consenso esplicito, che dai spuntando la casella prima di iniziare e puoi revocare in qualsiasi momento scrivendoci (senza la verifica però non potrai inviare preventivi). Immagini del documento e selfie restano a Didit e vengono cancellate secondo i suoi tempi di conservazione concordati con noi; ${BRAND.name} non riceve né conserva le immagini: salviamo solo l'esito (approvata, rifiutata o da controllare), il motivo di un eventuale rifiuto e la data del consenso. Se la verifica non conferma la tua identità ti diciamo il motivo e puoi rifarla. Non usiamo questi dati per altri scopi né per decisioni automatizzate diverse dall'accesso all'invio di preventivi: se la verifica viene rifiutata puoi riprovare, o scriverci all'indirizzo del punto 1 per farla rivedere da una persona.`,
        },
      ]}
    />
  );
}
