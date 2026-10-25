"use client";

import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { grantCookieConsent, useCookieConsent } from "@/lib/cookieConsent";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
/** Parametri di caricamento condivisi da tutti gli APIProvider del sito (mappe e suggerimenti indirizzi): devono coincidere, lo script Google si carica una sola volta. */
export const GOOGLE_API_PROVIDER_PROPS = { apiKey: API_KEY ?? "", language: "it", region: "IT", version: "quarterly" } as const;
export const HAS_GOOGLE_MAPS_KEY = Boolean(API_KEY);
/**
 * Map ID di Google Cloud (Gestione mappe, tipo JavaScript/vettoriale),
 * necessario per i segnaposto avanzati della mappa dei risultati
 * (docs/CHANGELOG.md §140). `DEMO_MAP_ID` è l'ID di prova di Google:
 * funziona, ma in produzione va impostato un Map ID proprio.
 */
export const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

/**
 * Unico ingresso a Google Maps nel sito (docs/CHANGELOG.md §133): carica lo
 * script di Google solo se c'è la chiave (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
 * e solo dopo il consenso ai servizi Google del banner cookie — stesso
 * principio seguito allora per Google Sign-In. Senza consenso mostra
 * l'immagine fissa (`staticMap`, §265) o un riquadro con il pulsante per
 * attivare la mappa; senza chiave un messaggio
 * neutro (stesso pattern "non configurato" di Stripe/Cloudinary/Resend).
 */
/**
 * Google chiama `window.gm_authFailure` quando rifiuta chiave/configurazione
 * (indirizzo del sito non autorizzato, API non abilitata, fatturazione...):
 * la mappa resta a metà e i suoi componenti vanno in errore dentro il codice
 * di Google (docs/CHANGELOG.md §137). Qui lo si intercetta per mostrare un
 * messaggio chiaro, con l'indirizzo da cui si sta navigando.
 */
function useGoogleAuthFailure(): boolean {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = () => setFailed(true);
  }, []);
  return failed;
}

/** Cosa mostrare nell'immagine fissa della mappa (docs/CHANGELOG.md §265). */
export type StaticMapSpec = { markers: [number, number][]; center?: [number, number]; zoom?: number; radiiKm?: number[] };

export function GoogleMapGate({ children, staticMap }: { children: ReactNode; staticMap?: StaticMapSpec }) {
  const consent = useCookieConsent();
  const authFailed = useGoogleAuthFailure();

  if (!API_KEY) {
    return <MapPlaceholder text="Mappa non configurata (manca la chiave Google Maps)." />;
  }
  if (!consent) {
    if (staticMap) return <StaticMapPreview spec={staticMap} />;
    return (
      <MapPlaceholder text="La mappa è fornita da Google Maps: per mostrarla serve il tuo consenso ai servizi Google.">
        <button type="button" className="map-consent-button" onClick={grantCookieConsent}>
          Mostra la mappa
        </button>
      </MapPlaceholder>
    );
  }
  if (authFailed) {
    return (
      <MapPlaceholder text="Mappa non disponibile: Google ha rifiutato la chiave Google Maps.">
        <small className="map-error-detail">
          Indirizzo del sito: {typeof window !== "undefined" ? window.location.host : ""} — deve essere tra i siti
          consentiti della chiave, con Maps JavaScript API abilitata e la fatturazione attiva.
        </small>
      </MapPlaceholder>
    );
  }
  return (
    <MapErrorBoundary>
      {/* Versione "quarterly" (aggiornata ogni tre mesi, più collaudata) invece
          della "weekly" di default: gli errori di §135-§137 nascevano tutti
          dentro il codice di Google (docs/CHANGELOG.md §138). */}
      <APIProvider {...GOOGLE_API_PROVIDER_PROPS}>
        {children}
      </APIProvider>
    </MapErrorBoundary>
  );
}

/**
 * Senza consenso ai servizi Google (docs/CHANGELOG.md §265, richiesta
 * dell'utente): un'immagine fissa della mappa con i segnaposto, preparata dal
 * nostro server, così si vede subito dove sono i professionisti senza caricare
 * nulla di Google nel browser. Toccandola si attiva la mappa interattiva
 * (consenso). Se l'immagine non arriva resta il riquadro con il pulsante.
 */
function StaticMapPreview({ spec }: { spec: StaticMapSpec }) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // Il raggio cambia mentre si trascina il cursore: si chiede una nuova
  // immagine solo quando ci si ferma.
  const specKey = JSON.stringify(spec);
  const [shownKey, setShownKey] = useState(specKey);
  useEffect(() => {
    const timer = setTimeout(() => setShownKey(specKey), 400);
    return () => clearTimeout(timer);
  }, [specKey]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // Google accetta al massimo 640 px per lato (raddoppiati con scale=2): si
    // riduce mantenendo le proporzioni del riquadro, così nulla viene tagliato.
    const { width, height } = box.getBoundingClientRect();
    const ratio = Math.min(1, 640 / Math.max(width, 1), 640 / Math.max(height, 1));
    setSize({ width: Math.max(100, Math.round(width * ratio)), height: Math.max(100, Math.round(height * ratio)) });
  }, []);

  if (failed) {
    return (
      <MapPlaceholder text="La mappa è fornita da Google Maps: per mostrarla serve il tuo consenso ai servizi Google.">
        <button type="button" className="map-consent-button" onClick={grantCookieConsent}>
          Mostra la mappa
        </button>
      </MapPlaceholder>
    );
  }

  const src = size ? apiClient.staticMapUrl({ ...(JSON.parse(shownKey) as StaticMapSpec), ...size }) : null;
  return (
    <div ref={boxRef} className="static-map">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- immagine del nostro server
        <img src={src} alt="Mappa con la posizione dei professionisti" onError={() => setFailed(true)} />
      ) : null}
      <button type="button" className="static-map-button" onClick={grantCookieConsent}>
        <MapPin size={16} strokeWidth={2} aria-hidden />
        Usa la mappa interattiva
      </button>
      <style jsx>{`
        .static-map {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 200px;
          background: #f5f1ea;
          overflow: hidden;
        }
        .static-map img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .static-map-button {
          position: absolute;
          left: 50%;
          bottom: 14px;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          background: #ffffff;
          color: #2b2013;
          border: 1px solid rgba(43, 32, 19, 0.15);
          border-radius: 999px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
        }
        .static-map-button:hover {
          background: #f5f1ea;
        }
      `}</style>
    </div>
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
          <small className="map-error-detail">{describeError(this.state.error)}</small>
        </MapPlaceholder>
      );
    }
    return this.props.children;
  }
}

/** Messaggio + prime righe dello stack (file/riga), per capire da dove nasce l'errore da uno screenshot. */
function describeError(error: Error): string {
  const stack = (error.stack ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(error.name))
    .slice(0, 2)
    .map((line) => line.replace(/https?:\/\/[^/]+/, ""))
    .join(" · ");
  return `${error.message || String(error)}${stack ? ` — ${stack}` : ""}`;
}

function MapPlaceholder({ text, children }: { text: string; children?: ReactNode }) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
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
