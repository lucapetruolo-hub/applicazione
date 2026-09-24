import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Quali cookie e strumenti simili usa Professionisti.",
};

export default function CookiePage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updatedAt="23 settembre 2026"
      sections={[
        {
          heading: "1. Cosa sono i cookie",
          body: "I cookie sono piccoli file di testo che i siti salvano sul tuo dispositivo per funzionare correttamente e ricordare le tue preferenze. Usiamo anche tecnologie simili (es. archiviazione locale del browser) per lo stesso scopo.",
        },
        {
          heading: "2. Cookie tecnici (necessari)",
          body: "Usiamo cookie e archiviazione locale strettamente necessari al funzionamento: mantenere la sessione di accesso, ricordare le preferenze di navigazione e garantire la sicurezza. Questi non richiedono consenso e non possono essere disattivati senza compromettere l'uso del sito.",
        },
        {
          heading: "3. Cookie di terze parti",
          body: "Alcuni servizi di Google integrati nel sito possono impostare propri cookie e ricevere dati tecnici di navigazione (es. indirizzo IP): il pulsante di accesso con Google e le mappe dei risultati di ricerca (Google Maps). Li carichiamo solo dopo il tuo consenso, dato con il pulsante del banner cookie o con \"Mostra la mappa\"; senza consenso la mappa non viene caricata. Per i dettagli vedi l'informativa privacy di Google (policies.google.com/privacy). Non usiamo cookie pubblicitari né di profilazione di terze parti.",
        },
        {
          heading: "4. Gestione delle preferenze",
          body: "Puoi cancellare o bloccare i cookie dalle impostazioni del tuo browser. La disattivazione dei cookie tecnici può impedire il login e alcune funzionalità. Per le statistiche di visita usiamo Vercel Web Analytics, che non usa cookie né identifica i singoli utenti. Bozza da far verificare a un legale.",
        },
      ]}
    />
  );
}
