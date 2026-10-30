import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { BRAND } from "@professionisti/shared";

export const metadata: Metadata = {
  title: "Accessibilità",
  description: `L'impegno di ${BRAND.name} per un sito accessibile a tutti, gli standard seguiti e come segnalare un problema.`,
  alternates: { canonical: "/accessibilita" },
};

/**
 * Dichiarazione di accessibilità (richiesta esplicita dell'utente, "Verbale
 * di Conformità"): come verifichiamo, limiti noti dichiarati onestamente e
 * a chi scrivere. Aggiornata dopo il collaudo del 29/10/2026 (M-12): quando
 * il gruppo 6 "Accessibilità con la tastiera" sistema i problemi, va
 * aggiornato il punto 3. Stesso layout di /privacy, /termini, /cookie.
 */
export default function AccessibilitaPage() {
  return (
    <LegalPage
      title="Accessibilità"
      updatedAt="30 ottobre 2026"
      sections={[
        {
          heading: "1. Il nostro impegno",
          body: BRAND.name + " è pensato per essere usabile dal maggior numero di persone possibile, incluse quelle che usano tecnologie assistive (lettori di schermo, navigazione da tastiera) o hanno difficoltà visive, motorie o cognitive. Prendiamo come riferimento le Web Content Accessibility Guidelines (WCAG) 2.1, livello AA, e lo European Accessibility Act (Direttiva (UE) 2019/882, recepita in Italia con il D.Lgs. 82/2022).",
        },
        {
          // Niente più "100/100": il collaudo del 29/10/2026 (M-12, L-01…L-14)
          // ha trovato problemi con la tastiera che quel punteggio non vedeva.
          heading: "2. Come lo verifichiamo",
          body: "Controlliamo le pagine principali (home, ricerca, profilo del professionista, richiesta di preventivo) con strumenti automatici (Lighthouse, axe e test con Playwright) a ogni modifica del sito, e con prove a mano da telefono e computer, anche usando solo la tastiera. Ultima verifica completa: 29 ottobre 2026. Il sito ha un collegamento \"Vai al contenuto\" per saltare l'intestazione, etichette leggibili dai lettori di schermo su pulsanti e campi, contrasti di colore conformi sui testi principali e rispetta l'impostazione \"riduci le animazioni\" del dispositivo.",
        },
        {
          heading: "3. Limiti noti",
          body: "L'ultima verifica ha trovato alcune parti che con la sola tastiera non funzionano ancora bene: alcune schede di richieste e preventivi non si aprono e alcune caselle da spuntare non rispondono al tasto spazio; ci stiamo lavorando. L'agenda del professionista e la mappa dei risultati (Google Maps) non sono ancora state verificate con lo stesso dettaglio: i risultati della ricerca sono sempre disponibili anche come elenco, senza la mappa.",
        },
        {
          heading: "4. Segnala un problema di accessibilità",
          body: `Se incontri una barriera su questo sito, scrivici a ${BRAND.supportEmail} o dalla pagina Contatti, indicando la pagina e il problema: ti rispondiamo e lavoriamo per risolverlo.`,
        },
      ]}
    />
  );
}
