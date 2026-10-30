import type { Metadata } from "next";
import { LegalList, LegalPage, LegalSummary } from "@/components/LegalPage";
import { BRAND, CLIENT_DELETED_REQUEST_RETENTION_DAYS, COMPANY } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Come trattiamo i tuoi dati personali su ${BRAND.name}.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updatedAt="30 ottobre 2026"
      intro={
        <LegalSummary
          points={[
            "Usiamo i tuoi dati per farti trovare un professionista o dei clienti, e per la sicurezza del sito.",
            "Al professionista diamo telefono, email e indirizzo solo quando accetti un suo preventivo.",
            "Non vendiamo i tuoi dati a nessuno.",
            "Ogni dato ha un tempo di conservazione, scritto al punto 5; chiudendo l'account nome e contatti si cancellano subito.",
            "Puoi vedere, scaricare, correggere o cancellare i tuoi dati quando vuoi.",
          ]}
        />
      }
      sections={[
        {
          heading: "1. Titolare del trattamento",
          body: `Il titolare del trattamento dei dati è ${COMPANY.legalName}, ${COMPANY.address}, P.IVA ${COMPANY.vatNumber}, PEC ${COMPANY.pec}. Per qualsiasi domanda sui tuoi dati scrivi a ${COMPANY.privacyEmail}. Questa bozza va verificata da un legale prima del lancio definitivo.`,
        },
        {
          heading: "2. Dati che raccogliamo",
          body: "Raccogliamo i dati che ci fornisci direttamente: nome, indirizzo email, numero di telefono (se lo inserisci), città e indirizzo dell'intervento, descrizione del lavoro richiesto, eventuali foto o video caricati, i messaggi della chat, e — per i professionisti — i dati del profilo pubblico (nome attività, categoria, zona, servizi e prezzi) e i dati fiscali (codice fiscale, partita IVA, indirizzo, IBAN per la DAC7). Nella descrizione del lavoro e nelle foto scrivi e mostra solo quello che serve: in particolare, per le richieste di Babysitter, non caricare foto di bambini e non scrivere dati sulla loro salute. Raccogliamo inoltre dati tecnici di navigazione (log, indirizzo IP, tipo di browser) necessari al funzionamento e alla sicurezza del servizio.",
        },
        {
          heading: "3. Perché trattiamo i tuoi dati (finalità e base giuridica)",
          body: "Trattiamo i dati per: (a) creare e gestire il tuo account (esecuzione del contratto); (b) metterti in contatto con i professionisti o con i clienti (esecuzione del contratto); (c) inviarti comunicazioni di servizio relative alle tue richieste e prenotazioni (esecuzione del contratto); (d) migliorare la piattaforma e garantirne la sicurezza e la qualità: a questo scopo le conversazioni tra clienti e professionisti sulla piattaforma possono essere lette dal nostro personale autorizzato, per esempio per gestire segnalazioni, contestazioni o abusi, e ogni lettura viene registrata (legittimo interesse); (e) proporti il mestiere giusto quando descrivi il problema con parole tue (legittimo interesse a farti trovare la persona giusta, vedi il punto 4); (f) seguire da vicino le richieste per cui scegli \"Ce ne occupiamo noi\": il nostro personale legge la richiesta per trovarti i professionisti (esecuzione del contratto); (g) adempiere obblighi di legge, tra cui fiscali e contabili e la comunicazione DAC7 dei professionisti all'Agenzia delle Entrate. Dove il trattamento si basa sul tuo consenso (verifica con il volto, promemoria su WhatsApp, mappa interattiva) puoi revocarlo in qualsiasi momento, senza effetto su quanto fatto prima. Il conferimento dei dati di contatto è necessario per usare il servizio; senza di essi non possiamo inoltrare le richieste.",
        },
        {
          heading: "4. Con chi condividiamo i dati",
          id: "fornitori",
          body: "Condividiamo i dati strettamente necessari con: i professionisti a cui invii una richiesta (descrizione del lavoro e città; nome, telefono, email e indirizzo solo dopo che hai accettato un preventivo); i clienti, se sei un professionista (dati del tuo profilo pubblico). Ci aiutano a erogare il servizio, come responsabili del trattamento, questi fornitori: Render (server e database), Vercel (sito web e statistiche di visita anonime, senza cookie), Cloudinary (foto e video caricati), Resend (invio delle email), Google (accesso con Google, mappe, suggerimenti e ricerca degli indirizzi), Sentry (segnalazione degli errori tecnici del server, senza indirizzo IP né cookie), Cloudflare (controllo anti-bot quando crei un account con email e password, chiedi una nuova password o ci scrivi dalla pagina Contatti, senza cookie di profilazione) e, quando attivi i pagamenti online, Stripe (pagamenti con carta). Se accendi i promemoria su WhatsApp in Notifiche, Meta (WhatsApp) riceve il tuo numero e il testo dei promemoria. Per i professionisti, il controllo dei dati fiscali e dell'identità passa anche da Openapi e Didit (vedi il punto 8), e le fatture della piattaforma vanno al Sistema di Interscambio dell'Agenzia delle Entrate tramite Openapi. Quando descrivi il problema con parole tue e il nostro dizionario non basta a capire il mestiere, il testo, senza email, numeri di telefono, indirizzi e link, va a un servizio di intelligenza artificiale che propone il mestiere: Anthropic o, prima del lancio, OpenRouter, che lo passa a un modello gratuito (oggi di Google); i fornitori dei modelli gratuiti possono usare questi testi per migliorare i loro modelli. Il risultato è solo una proposta che puoi sempre cambiare, e lo indichiamo con la scritta \"Proposta automatica\". Comunichiamo i dati alle autorità quando la legge lo chiede: in particolare, ogni anno, i dati dei professionisti e dei loro incassi tramite la piattaforma all'Agenzia delle Entrate (DAC7, D.Lgs. 32/2023). La mappa interattiva viene caricata nel tuo browser solo dopo il tuo consenso. L'accesso con Google si apre in una finestra di Google solo quando lo scegli. L'immagine fissa della mappa e i suggerimenti degli indirizzi li chiede a Google il nostro server, senza cookie né dati del tuo browser (per i suggerimenti invia solo il testo che scrivi). Nell'agenda dei professionisti il nostro server chiede il meteo a Open-Meteo (solo le coordinate della zona del profilo o del comune dei lavori del giorno, mai l'indirizzo né altri dati personali) e i tempi di strada del giro a Google, a cui invia gli indirizzi delle tappe del giorno. Non vendiamo i tuoi dati a terzi.",
        },
        {
          heading: "5. Conservazione",
          body: "Conserviamo i dati solo per il tempo che serve, come indicato qui sotto. Puoi chiudere il tuo account in qualsiasi momento da Impostazioni: nome, cognome, email, telefono, data di nascita, foto del profilo e password vengono cancellati subito; il resto segue i tempi dell'elenco.",
          after: (
            <LegalList
              items={[
                { title: "Dati dell'account", rows: [["Per quanto", "finché l'account è aperto; alla chiusura cancellati subito, come detto sopra"]] },
                {
                  title: "Richieste, preventivi, lavori, chat e recensioni",
                  rows: [
                    ["Per quanto", "finché l'account è aperto; dopo la chiusura restano senza il tuo nome (\"Account eliminato\"), perché all'altra parte servono per il lavoro, per le garanzie e per eventuali segnalazioni"],
                    ["Richiesta eliminata da te", `cancellata dopo ${CLIENT_DELETED_REQUEST_RETENTION_DAYS} giorni, salvo una segnalazione aperta`],
                  ],
                },
                { title: "Descrizioni del problema per proporre il mestiere", rows: [["Per quanto", "1 anno"]] },
                { title: "Esito della verifica dell'identità e dei dati fiscali", rows: [["Per quanto", "finché l'account è aperto, poi quanto chiede la legge per la DAC7"]] },
                { title: "Dati fiscali dei professionisti e comunicazioni DAC7", rows: [["Per quanto", "10 anni dalla fine dell'anno a cui si riferiscono (D.Lgs. 32/2023)"]] },
                { title: "Fatture, pagamenti online e documenti contabili", rows: [["Per quanto", "10 anni (art. 2220 del codice civile)"]] },
                { title: "Conteggi per migliorare il sito", rows: [["Per quanto", "25 mesi, solo numeri per giorno (punto 9)"]] },
                { title: "Log tecnici e segnalazioni di errore", rows: [["Per quanto", "il tempo breve previsto dal servizio del fornitore, di norma poche settimane"]] },
              ]}
            />
          ),
        },
        {
          heading: "6. I tuoi diritti",
          body: `Hai diritto di accedere ai tuoi dati, rettificarli, cancellarli, limitarne o opporti al trattamento, e alla portabilità. Puoi esercitarli scrivendo a ${COMPANY.privacyEmail}; scarichi una copia dei tuoi dati anche da Impostazioni con "Esporta i tuoi dati". Ti rispondiamo entro un mese. Hai inoltre diritto di reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).`,
        },
        {
          heading: "7. Trasferimenti extra-UE",
          body: "Alcuni dei fornitori elencati al punto 4 hanno sede o server negli Stati Uniti: Render, Vercel, Cloudinary, Resend, Google, Sentry, Cloudflare, Stripe, Meta, Anthropic e OpenRouter. Il trasferimento avviene con garanzie adeguate: la decisione di adeguatezza UE-USA (Data Privacy Framework) per i fornitori che vi aderiscono, altrimenti le clausole contrattuali standard approvate dalla Commissione europea. Puoi chiederci copia delle garanzie scrivendo all'indirizzo del punto 1.",
        },
        {
          id: "verifica-identita",
          heading: "8. Verifica dei professionisti (dati fiscali, documento e selfie)",
          body: `Per proteggere i clienti verifichiamo chi lavora sulla piattaforma. (a) Dati fiscali: quando un professionista salva codice fiscale e partita IVA, verifichiamo la partita IVA con VIES, il servizio gratuito della Commissione europea, e, se VIES non la conferma, il codice fiscale e la partita IVA all'Agenzia delle Entrate e al Registro Imprese tramite Openapi S.p.A. (Italia), responsabile del trattamento; conserviamo solo l'esito (valido, non valido, attiva o cessata) e la ragione sociale ufficiale. Base giuridica: obbligo di legge (DAC7, D.Lgs. 32/2023) e legittimo interesse alla sicurezza della piattaforma. (b) Documento e selfie: prima di inviare il primo preventivo il professionista (per un'azienda, il legale rappresentante) fotografa un documento d'identità e fa un breve selfie con Didit Identity S.L. (Unione europea), responsabile del trattamento. Il confronto del volto con la foto del documento è un trattamento di dati biometrici (art. 9 GDPR) e avviene solo con il tuo consenso esplicito, che dai spuntando la casella prima di iniziare e puoi revocare in qualsiasi momento scrivendoci (senza la verifica però non potrai inviare preventivi). Immagini del documento e selfie restano a Didit e vengono cancellate secondo i suoi tempi di conservazione concordati con noi; ${BRAND.name} non riceve né conserva le immagini: salviamo solo l'esito (approvata, rifiutata o da controllare), il motivo di un eventuale rifiuto, la data del consenso e la data di scadenza del documento, per chiederti di rifare la verifica quando scade. Se la verifica non conferma la tua identità ti diciamo il motivo e puoi rifarla. Non usiamo questi dati per altri scopi né per decisioni automatizzate diverse dall'accesso all'invio di preventivi: se la verifica viene rifiutata puoi riprovare, o scriverci all'indirizzo del punto 1 per farla rivedere da una persona.`,
        },
        {
          id: "conteggi",
          heading: "9. Conteggi per migliorare il sito",
          body: "Per capire dove il sito funziona male contiamo, giorno per giorno, quante volte succedono alcune cose: ricerche per lavoro e città, prestazioni del nostro elenco che corrispondono a una ricerca scritta (si salva il nome della prestazione, mai il testo cercato), passi del modulo di richiesta raggiunti, voci di \"Quanto costa\" toccate e i profili aperti e le richieste inviate partiti da lì (per questo la scheda del browser tiene un segno temporaneo, che si cancella chiudendola), invii non riusciti, parole cercate che non corrispondono a nessun lavoro (salvate solo se cercate in almeno 3 giorni diversi e mai se contengono numeri, email o più di tre parole), il canale da cui è arrivato chi si iscrive (Google, social, link diretto) e il motivo facoltativo scelto da chi chiude l'account o l'abbonamento. Salviamo solo il numero per giorno, mai chi ha fatto cosa: nessun nome, indirizzo IP, identificativo del dispositivo o cookie di profilazione, quindi non serve il tuo consenso (legittimo interesse a migliorare il servizio). Gli amministratori e chi prova il sito usano un cookie tecnico (\"non_contare\") che serve solo a non essere contati. I conteggi si cancellano dopo 25 mesi.",
        },
      ]}
    />
  );
}
