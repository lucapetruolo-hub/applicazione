import type { Metadata } from "next";
import Link from "next/link";
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
 * a chi scrivere. Aggiornata dopo il collaudo del 29/10/2026 (M-12) e le
 * correzioni del gruppo 6 (punto 3). Stesso layout di /privacy, /termini, /cookie.
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
          // Aggiornato col gruppo 6 del collaudo (docs/changelog/2026-10-30-tastiera.md).
          heading: "3. Tastiera e lettore di schermo",
          body: "Dopo la verifica del 29 ottobre 2026 abbiamo corretto i problemi trovati con la sola tastiera: ogni comando si apre con Invio o Spazio, il comando su cui ti trovi ha un bordo scuro ben visibile, i menu si usano con le frecce e si chiudono con Esc, gli errori dei moduli vengono letti dai lettori di schermo e i pulsanti da telefono sono grandi almeno 44 pixel. Queste prove, con la tastiera e con axe, girano in automatico a ogni modifica del sito.",
        },
        {
          heading: "4. Limiti noti",
          body: "L'agenda del professionista e la mappa dei risultati (Google Maps) non sono ancora state verificate con lo stesso dettaglio: i risultati della ricerca sono sempre disponibili anche come elenco, senza la mappa.",
        },
        {
          heading: "5. Segnala un problema di accessibilità",
          body: (
            <>
              Se qualcosa non si riesce a usare (con la tastiera, con un lettore di schermo, ingrandendo il testo o da telefono), scrivici a {BRAND.supportEmail} o dal{" "}
              <Link href="/contatti">
                modulo Contatti
              </Link>
              : indica la pagina e cosa non ha funzionato. Ti rispondiamo e lo correggiamo.
            </>
          ),
        },
      ]}
    />
  );
}
