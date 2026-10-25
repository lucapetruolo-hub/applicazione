"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COOKIE_CONSENT_ACCEPTED_EVENT, COOKIE_CONSENT_CHANGED_EVENT, denyCookieConsent, grantCookieConsent, hasCookieChoice } from "@/lib/cookieConsent";

/**
 * Banner cookie minimale (post-audit GDPR): il sito usa solo cookie
 * tecnici necessari + eventuale Google Sign-In su scelta dell'utente, ma
 * l'informazione all'utente va comunque mostrata al primo accesso. La
 * scelta è salvata in localStorage (niente server, niente cookie di
 * terze parti da noi). Nessuna libreria esterna.
 */
const buttonStyle = {
  borderRadius: 999,
  padding: "7px 16px",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

export function CookieBanner() {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §335).
  "use no memo";
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // La scelta salvata nel browser si legge solo dopo il montaggio (nel render del server non c'è).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasCookieChoice()) setVisible(true);
    // "Preferenze cookie" nel footer riapre il banner per cambiare idea
    // (revoca del consenso, docs/CHANGELOG.md §170).
    const reopen = () => setVisible(true);
    // Consenso dato da un altro punto ("Usa la mappa interattiva", "Mostra la mappa"): il banner sparisce.
    const hide = () => setVisible(false);
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, reopen);
    window.addEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, hide);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, reopen);
      window.removeEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, hide);
    };
  }, []);

  // Finché il banner è aperto la pagina lascia in fondo uno spazio alto
  // quanto lui (padding del body) e il browser, scorrendo verso un elemento
  // selezionato con la tastiera, lo tiene sopra il banner (scroll-padding):
  // prima da telefono circa metà dei passaggi col tasto Tab finiva coperta
  // (regola WCAG 2.2 "focus non coperto", docs/CHANGELOG.md §271).
  useEffect(() => {
    const banner = bannerRef.current;
    if (!visible || !banner) return;
    const root = document.documentElement;
    const apply = () => {
      const height = `${banner.offsetHeight}px`;
      document.body.style.paddingBottom = height;
      root.style.scrollPaddingBottom = height;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
      root.style.scrollPaddingBottom = "";
    };
  }, [visible]);

  function accept() {
    // Richiesta esplicita dell'utente ("Verbale di Conformità"): sveglia
    // le mappe Google, che aspettano il consenso prima di caricare gli
    // script Google.
    grantCookieConsent();
    setVisible(false);
  }

  function deny() {
    // Prima della chiusura: denyCookieConsent emette lo stesso evento che
    // riapre il banner.
    denyCookieConsent();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    // Barra sottile ancorata al bordo inferiore reale (mai un overlay
    // centrale fluttuante) — richiesta esplicita dell'utente, "Verbale
    // Cognitivo" F1.1: la card centrata precedente arrivava a coprire la
    // barra di ricerca/i bottoni "Filtri"/"Mostra mappa" su mobile, il
    // primo ostacolo incontrato proprio sull'azione primaria del sito.
    // Altezza tenuta bassa (padding compatto, testo su una riga su schermi
    // larghi), di solito sotto la soglia 12-15% del viewport indicata dal
    // rilievo.
    <div
      ref={bannerRef}
      role="dialog"
      aria-label="Informativa cookie"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        // Mai tagliato: a 320×568 il limite del 15% nascondeva metà dei
        // pulsanti (docs/CHANGELOG.md §285). Il limite resta solo come
        // garanzia sugli schermi bassissimi, con scorrimento interno.
        maxHeight: "40vh",
        overflowY: "auto",
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e3ded4",
        boxShadow: "0 -4px 20px rgba(43,32,19,0.12)",
        padding: "10px 16px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        // Sopra anche alle finestre di accesso (zIndex 300), docs/CHANGELOG.md §214.
        zIndex: 400,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontFamily: "var(--font-body), sans-serif",
      }}
    >
      <p style={{ flex: "1 1 260px", margin: 0, fontSize: 13, lineHeight: 1.4, color: "#2b2420" }}>
        <span className="cookie-text-long">
          Usiamo solo cookie tecnici necessari al funzionamento del sito e, se lo accetti, la mappa
          interattiva di Google. Nessun cookie pubblicitario o di profilazione. Puoi cambiare idea quando vuoi da
          &quot;Preferenze cookie&quot; in fondo alla pagina.
        </span>
        <span className="cookie-text-short">
          Solo cookie tecnici e, se accetti, la mappa di Google. Niente pubblicità. Puoi cambiare idea
          in fondo alla pagina.
        </span>{" "}
        <Link href="/cookie" style={{ color: "#0e7a4c", fontWeight: 600 }}>
          Cookie Policy
        </Link>
        .
      </p>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {/* Stesso peso visivo per i due bottoni: rifiutare dev'essere facile
            quanto accettare (Garante privacy, linee guida cookie 2021). */}
        <button type="button" onClick={deny} style={{ ...buttonStyle, backgroundColor: "#ffffff", color: "#0e7a4c", border: "1.5px solid #0e7a4c" }}>
          Rifiuta
        </button>
        <button type="button" onClick={accept} style={{ ...buttonStyle, backgroundColor: "#189a63", color: "#ffffff", border: "1.5px solid #189a63" }}>
          Accetta
        </button>
      </div>
      {/* Telefono (docs/CHANGELOG.md §206): il testo lungo andava su 5 righe e
          il banner copriva metà della prima scheda dei risultati. Sotto 600px
          testo breve con le stesse informazioni e bottoni più bassi. */}
      <style jsx>{`
        .cookie-text-short {
          display: none;
        }
        @media (max-width: 600px) {
          .cookie-text-long {
            display: none;
          }
          .cookie-text-short {
            display: inline;
          }
          [role="dialog"] {
            padding-top: 8px !important;
            gap: 8px !important;
          }
          [role="dialog"] p {
            font-size: 12px !important;
          }
          [role="dialog"] button {
            padding: 5px 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
