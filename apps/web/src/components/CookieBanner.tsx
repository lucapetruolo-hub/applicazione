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
    <div
      role="dialog"
      aria-label="Informativa cookie"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 560,
        margin: "0 auto",
        backgroundColor: "#ffffff",
        borderRadius: 18,
        boxShadow: "0 8px 30px rgba(43,32,19,0.16)",
        padding: "16px 20px",
        zIndex: 200,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        fontFamily: "var(--font-body), sans-serif",
      }}
    >
      <p style={{ flex: "1 1 260px", margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#2b2420" }}>
        Usiamo solo cookie tecnici necessari al funzionamento del sito e, se lo scegli, l'accesso con Google. Nessun
        cookie pubblicitario o di profilazione. Dettagli nella{" "}
        <Link href="/cookie" style={{ color: "#189a63", fontWeight: 600 }}>
          Cookie Policy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={accept}
        style={{
          backgroundColor: "#189a63",
          color: "#ffffff",
          border: "none",
          borderRadius: 999,
          padding: "10px 20px",
          fontSize: 14,
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
