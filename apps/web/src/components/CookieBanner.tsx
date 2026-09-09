"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COOKIE_CONSENT_ACCEPTED_EVENT } from "@/components/GoogleSignInButton";

const CONSENT_KEY = "cookie-consent-v1";

/**
 * Banner cookie minimale (post-audit GDPR): il sito usa solo cookie
 * tecnici necessari + eventuale Google Sign-In su scelta dell'utente, ma
 * l'informazione all'utente va comunque mostrata al primo accesso. La
 * scelta è salvata in localStorage (niente server, niente cookie di
 * terze parti da noi). Nessuna libreria esterna.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {
      // localStorage non disponibile (es. privacy mode): non mostriamo il
      // banner ad ogni pagina, meglio non bloccare la navigazione.
    }
  }, []);

  function accept() {
    try {
      window.localStorage.setItem(CONSENT_KEY, "accepted");
    } catch {
      // ignora
    }
    // Richiesta esplicita dell'utente ("Verbale di Conformità"): sveglia
    // GoogleSignInButton, che aspetta questo evento prima di caricare lo
    // script Google se il consenso non era ancora stato dato al mount.
    window.dispatchEvent(new Event(COOKIE_CONSENT_ACCEPTED_EVENT));
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
    // larghi) e comunque limitata a titolo di garanzia (`maxHeight`) ben
    // sotto la soglia 12-15% del viewport indicata dal rilievo.
    <div
      role="dialog"
      aria-label="Informativa cookie"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        maxHeight: "15vh",
        overflow: "hidden",
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e3ded4",
        boxShadow: "0 -4px 20px rgba(43,32,19,0.12)",
        padding: "10px 16px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        zIndex: 200,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontFamily: "var(--font-body), sans-serif",
      }}
    >
      <p style={{ flex: "1 1 260px", margin: 0, fontSize: 12.5, lineHeight: 1.4, color: "#2b2420" }}>
        Usiamo solo cookie tecnici necessari al funzionamento del sito e, se lo scegli, l'accesso con Google. Nessun
        cookie pubblicitario o di profilazione.{" "}
        <Link href="/cookie" style={{ color: "#189a63", fontWeight: 600 }}>
          Cookie Policy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={accept}
        style={{
          flexShrink: 0,
          backgroundColor: "#189a63",
          color: "#ffffff",
          border: "none",
          borderRadius: 999,
          padding: "8px 18px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Ho capito
      </button>
    </div>
  );
}
