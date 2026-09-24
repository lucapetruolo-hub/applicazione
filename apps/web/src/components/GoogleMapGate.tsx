"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import { grantCookieConsent, useCookieConsent } from "@/lib/cookieConsent";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
/**
 * Map ID di Google Cloud (Map Management), necessario per i marker
 * "avanzati". `DEMO_MAP_ID` è l'ID di prova di Google: funziona, ma per la
 * produzione va creato un Map ID proprio.
 */
export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

/**
 * Unico ingresso a Google Maps nel sito (docs/CHANGELOG.md §133): carica lo
 * script di Google solo se c'è la chiave (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
 * e solo dopo il consenso ai servizi Google del banner cookie — stesso
 * principio già seguito per Google Sign-In. Senza consenso mostra un
 * riquadro con il pulsante per attivare la mappa; senza chiave un messaggio
 * neutro (stesso pattern "non configurato" di Stripe/Cloudinary/Resend).
 */
export function GoogleMapGate({ children }: { children: ReactNode }) {
  const consent = useCookieConsent();

  if (!API_KEY) {
    return <MapPlaceholder text="Mappa non configurata (manca la chiave Google Maps)." />;
  }
  if (!consent) {
    return (
      <MapPlaceholder text="La mappa è fornita da Google Maps: per mostrarla serve il tuo consenso ai servizi Google.">
        <button type="button" className="map-consent-button" onClick={grantCookieConsent}>
          Mostra la mappa
        </button>
      </MapPlaceholder>
    );
  }
  return (
    <MapErrorBoundary>
      <APIProvider apiKey={API_KEY} language="it" region="IT">
        {children}
      </APIProvider>
    </MapErrorBoundary>
  );
}

/**
 * Un errore dentro la mappa (script Google, marker, cerchi) non deve mai
 * far crollare l'intera pagina con "Application error" — la mappa è un
 * accessorio della ricerca/del profilo, non il loro contenuto. Mostra il
 * riquadro neutro e lascia il resto della pagina utilizzabile.
 */
class MapErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Errore nella mappa Google:", error, info.componentStack);
  }

  render() {
    // Il dettaglio dell'errore resta visibile (piccolo) per poterlo
    // segnalare anche da telefono, senza aprire la console del browser.
    if (this.state.error) {
      return (
        <MapPlaceholder text="Mappa non disponibile al momento.">
          <small className="map-error-detail">{this.state.error.message || String(this.state.error)}</small>
        </MapPlaceholder>
      );
    }
    return this.props.children;
  }
}

function MapPlaceholder({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="map-placeholder">
      <MapPin size={28} strokeWidth={1.5} color="#6e6459" />
      <p>{text}</p>
      {children}
      <style jsx>{`
        .map-placeholder {
          width: 100%;
          height: 100%;
          min-height: 200px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px;
          text-align: center;
          background: #f5f1ea;
          font-size: 13px;
          color: #6e6459;
        }
        .map-placeholder p {
          margin: 0;
          max-width: 280px;
          line-height: 1.4;
        }
        .map-placeholder :global(.map-error-detail) {
          max-width: 320px;
          font-size: 11px;
          color: #9a8f82;
          word-break: break-word;
        }
        .map-placeholder :global(.map-consent-button) {
          background: #189a63;
          color: #ffffff;
          border: none;
          border-radius: 999px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
