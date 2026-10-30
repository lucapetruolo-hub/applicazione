import type { Metadata } from "next";
import { LegalList, LegalPage } from "@/components/LegalPage";
import { BRAND } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: `Quali cookie e strumenti simili usa ${BRAND.name}.`,
  alternates: { canonical: "/cookie" },
};

export default function CookiePage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updatedAt="30 ottobre 2026"
      sections={[
        {
          heading: "1. Cosa sono i cookie",
          body: "I cookie sono piccoli file di testo che i siti salvano sul tuo dispositivo per funzionare correttamente e ricordare le tue preferenze. Usiamo anche tecnologie simili (es. archiviazione locale del browser) per lo stesso scopo.",
        },
        {
          heading: "2. Cookie tecnici (necessari)",
          body: "Usiamo cookie e archiviazione locale strettamente necessari al funzionamento: mantenere la sessione di accesso, ricordare le preferenze di navigazione e garantire la sicurezza (ad esempio un codice casuale che ci fa riconoscere un accesso da un dispositivo nuovo, per avvisarti via email). Questi non richiedono consenso e non possono essere disattivati senza compromettere l'uso del sito. Sono tutti nostri, nessuno di terze parti, e quelli nell'archiviazione locale restano finché non esci dall'account o non li cancelli dal browser, salvo durate diverse indicate qui sotto.",
          // Tabella con nome, scopo e durata (linee guida cookie del Garante,
          // 10/06/2021; collaudo del 29/10/2026, M-13). Va tenuta allineata
          // alle chiavi in apps/web/src/lib/ quando se ne aggiunge una.
          after: (
            <LegalList
              items={[
                { title: "Accesso all'account", rows: [["Nome", "professionisti_token"], ["Scopo", "tenerti dentro l'account"], ["Durata", "fino all'uscita dall'account"]] },
                { title: "Dispositivo riconosciuto", rows: [["Nome", "login-device-id"], ["Scopo", "riconoscere un accesso da un dispositivo nuovo e avvisarti per email"], ["Durata", "finché non lo cancelli dal browser"]] },
                { title: "Scelta sui cookie", rows: [["Nome", "cookie-consent-v1"], ["Scopo", "ricordare se hai accettato o rifiutato i servizi Google"], ["Durata", "finché non cambi scelta o non la cancelli dal browser"]] },
                { title: "Accesso con Google", rows: [["Nome", "google-signin-pending, google-signin-result"], ["Scopo", "completare l'accesso nella finestra di Google"], ["Durata", "fino alla chiusura della scheda"]] },
                {
                  title: "Preferenze",
                  rows: [
                    ["Nome", "ultima_citta_cercata, ricerca:ultima-citta, professionisti_menu_ridotto, agenda-vista, agenda-colonna-nascosta"],
                    ["Scopo", "ricordare l'ultima città cercata e come preferisci vedere menu e agenda"],
                    ["Durata", "finché non le cancelli dal browser"],
                  ],
                },
                { title: "Agenda senza rete", rows: [["Nome", "agenda-offline-v1, agenda-offline-user-v1"], ["Scopo", "mostrare ai professionisti gli appuntamenti anche senza connessione"], ["Durata", "al massimo 7 giorni, cancellata all'uscita dall'account"]] },
                { title: "Segnalazioni già inviate", rows: [["Nome", "reportedContent:…"], ["Scopo", "non far segnalare due volte lo stesso contenuto"], ["Durata", "24 ore"]] },
                {
                  title: "Conteggi per migliorare il sito",
                  rows: [
                    ["Nome", "traffic_source, da_quanto_costa"],
                    ["Scopo", "contare, senza sapere chi sei, da dove arriva chi si iscrive e cosa succede dopo \"Quanto costa\" (Privacy Policy, punto 9)"],
                    ["Durata", "fino alla chiusura della scheda"],
                  ],
                },
                { title: "Non contare questo browser", rows: [["Nome", "non_contare (cookie), non_contare_scelto"], ["Scopo", "non contare le visite di amministratori e di chi prova il sito"], ["Durata", "1 anno il cookie; la scelta finché non la cancelli dal browser"]] },
              ]}
            />
          ),
        },
        {
          heading: "3. Cookie di terze parti",
          body: "La mappa interattiva dei risultati (Google Maps) può impostare cookie di Google e ricevere dati tecnici di navigazione (es. indirizzo IP). La carichiamo solo dopo il tuo consenso, dato con il pulsante \"Accetta\" del banner cookie o con \"Usa la mappa interattiva\"; senza consenso vedi un'immagine fissa della mappa preparata dal nostro server. L'accesso con Google si fa sulla pagina di Google, che si apre a parte: sul nostro sito non carichiamo nulla di Google. Per i dettagli vedi l'informativa privacy di Google (policies.google.com/privacy). Non usiamo cookie pubblicitari né di profilazione di terze parti.",
        },
        {
          heading: "4. Gestione delle preferenze",
          body: "Puoi cambiare o revocare in ogni momento la scelta sui servizi Google dal link \"Preferenze cookie\" in fondo a ogni pagina: se revochi il consenso la pagina si ricarica senza i servizi Google. Puoi anche cancellare o bloccare i cookie dalle impostazioni del tuo browser. La disattivazione dei cookie tecnici può impedire il login e alcune funzionalità. Per le statistiche di visita usiamo Vercel Web Analytics, che non usa cookie né identifica i singoli utenti. Le foto dei profili arrivano da Cloudinary, il servizio che le conserva: non imposta cookie, ma come ogni sito che mostra un'immagine riceve l'indirizzo IP del tuo dispositivo. Bozza da far verificare a un legale.",
        },
      ]}
    />
  );
}
