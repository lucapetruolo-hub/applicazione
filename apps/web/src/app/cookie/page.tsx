import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
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
      updatedAt="2 ottobre 2026"
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
          body: "La mappa interattiva dei risultati (Google Maps) può impostare cookie di Google e ricevere dati tecnici di navigazione (es. indirizzo IP). La carichiamo solo dopo il tuo consenso, dato con il pulsante \"Accetta\" del banner cookie o con \"Usa la mappa interattiva\"; senza consenso vedi un'immagine fissa della mappa preparata dal nostro server. L'accesso con Google si fa sulla pagina di Google, che si apre a parte: sul nostro sito non carichiamo nulla di Google. Per i dettagli vedi l'informativa privacy di Google (policies.google.com/privacy). Non usiamo cookie pubblicitari né di profilazione di terze parti.",
        },
        {
          heading: "4. Gestione delle preferenze",
          body: "Puoi cambiare o revocare in ogni momento la scelta sui servizi Google dal link \"Preferenze cookie\" in fondo a ogni pagina: se revochi il consenso la pagina si ricarica senza i servizi Google. Puoi anche cancellare o bloccare i cookie dalle impostazioni del tuo browser. La disattivazione dei cookie tecnici può impedire il login e alcune funzionalità. Per le statistiche di visita usiamo Vercel Web Analytics, che non usa cookie né identifica i singoli utenti. Bozza da far verificare a un legale.",
        },
      ]}
    />
  );
}
