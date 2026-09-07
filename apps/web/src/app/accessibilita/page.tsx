import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Accessibilità",
  description: "L'impegno di Professionisti per un sito accessibile a tutti, gli standard seguiti e come segnalare un problema.",
};

/**
 * Dichiarazione di accessibilità (richiesta esplicita dell'utente, "Verbale
 * di Conformità" — punto del piano d'azione "pagina accessibilità
 * pubblica"): documenta l'audit già svolto durante il redesign (CLAUDE.md
 * §10, Fase 6 "anti-spam, SEO, accessibilità, performance") invece di
 * limitarsi a una dichiarazione di intenti generica — punteggio Lighthouse
 * reale, interventi WCAG concreti già fatti, limiti noti onestamente
 * dichiarati. Stesso layout condiviso di /privacy, /termini, /cookie
 * (`LegalPage`).
 */
export default function AccessibilitaPage() {
  return (
    <LegalPage
      title="Accessibilità"
      updatedAt="7 settembre 2026"
      sections={[
        {
          heading: "1. Il nostro impegno",
          body: "Professionisti è pensato per essere usabile dal maggior numero di persone possibile, incluse quelle che usano tecnologie assistive (screen reader, navigazione da tastiera) o hanno difficoltà visive, motorie o cognitive. Prendiamo come riferimento le Web Content Accessibility Guidelines (WCAG) 2.1, livello AA, e la Direttiva (UE) 2016/2102 sull'accessibilità dei siti web, per quanto applicabile a un servizio privato come il nostro.",
        },
        {
          heading: "2. Cosa abbiamo già verificato e corretto",
          body: "Un audit reale (non solo una lettura del codice) con Lighthouse e con test automatizzati basati su Playwright ha misurato un punteggio di Accessibilità di 100/100 sulle pagine principali (home, ricerca per categoria, profilo professionista) dopo aver corretto i problemi rilevati: un collegamento \"Vai al contenuto\" per saltare l'intestazione con la tastiera, ruoli e stati ARIA sugli elementi interattivi (card cliccabili, dialoghi, pulsanti di stato), contrasto colore conforme su tutti i link e i testi principali, ed etichette accessibili coerenti con il testo visibile (evitando la violazione WCAG 2.5.3 \"Label in Name\"). Il sito rispetta inoltre la preferenza di sistema \"riduci le animazioni\" (prefers-reduced-motion): con questa opzione attiva, le transizioni diventano istantanee invece di animarsi.",
        },
        {
          heading: "3. Limiti noti",
          body: "Alcune parti del sito non sono ancora state verificate con lo stesso livello di dettaglio delle pagine principali: in particolare l'agenda del professionista (calendario personalizzato) e la mappa dei risultati di ricerca (basata su Leaflet/OpenStreetMap), entrambe costruite su misura perché nessuna libreria pronta si adattava alle esigenze del prodotto. Stiamo lavorando per estendere la stessa verifica a queste sezioni. Il punteggio di performance complessivo del sito (diverso da quello di accessibilità) è inferiore all'obiettivo interno a causa della scelta architetturale di condividere lo stesso design system tra sito web e app mobile: una scelta consapevole, non ancora ottimizzata.",
        },
        {
          heading: "4. Segnala un problema di accessibilità",
          body: "Se incontri una barriera all'accesso su questo sito, scrivici a [DA COMPILARE: email accessibilità/assistenza] descrivendo la pagina e il problema riscontrato: ti risponderemo e lavoreremo per risolverlo. Questa pagina verrà aggiornata quando l'indirizzo reale sarà disponibile.",
        },
      ]}
    />
  );
}
