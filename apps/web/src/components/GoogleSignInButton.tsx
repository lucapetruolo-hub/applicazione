"use client";

import { useEffect, useRef } from "react";
import { Button, Text, XStack, brand } from "@professionisti/ui";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

// Icona ufficiale "G" multicolore di Google (la stessa dei pulsanti "Sign in
// with Google" del brand kit ufficiale).
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

const COOKIE_CONSENT_KEY = "cookie-consent-v1";
/** Nome dell'evento globale che CookieBanner emette all'accettazione — vedi lì. */
export const COOKIE_CONSENT_ACCEPTED_EVENT = "cookie-consent-accepted";

function hasCookieConsent(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

/**
 * Pulsante "Continua con Google" con stile custom (pillola, larghezza piena,
 * icona ufficiale) per uniformarsi al resto del form invece di usare la
 * grafica fissa del widget Google. Il widget ufficiale viene comunque
 * renderizzato — fuori schermo — ed è quello che riceve il click reale: solo
 * così il flusso OAuth resta quello genuino di Google (nessun popup finto,
 * niente credenziali gestite da noi).
 *
 * Richiesta esplicita dell'utente ("Verbale di Conformità" — subordinare lo
 * script Google al consenso cookie): lo script `gsi/client` di Google, unico
 * script di terze parti del sito, non viene più caricato incondizionatamente
 * al mount di questa pagina — solo dopo che il banner cookie (`CookieBanner`)
 * è stato accettato. Se il consenso non c'è ancora, resta in attesa
 * dell'evento `COOKIE_CONSENT_ACCEPTED_EVENT` emesso da quel banner, invece
 * di ripetere qui la stessa logica di lettura del banner.
 */
export function GoogleSignInButton({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;

    function renderButton() {
      if (!window.google || !hiddenContainerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(hiddenContainerRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
      });
    }

    function loadScript() {
      const scriptId = "google-identity-services";
      const existing = document.getElementById(scriptId);
      if (existing) {
        renderButton();
        return;
      }
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = renderButton;
      document.body.appendChild(script);
    }

    if (hasCookieConsent()) {
      loadScript();
      return;
    }
    function onConsentAccepted() {
      loadScript();
    }
    window.addEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onConsentAccepted);
    return () => window.removeEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onConsentAccepted);
  }, [clientId, onCredential]);

  if (!clientId) {
    return null;
  }

  function handlePress() {
    if (disabled) return;
    const realButton = hiddenContainerRef.current?.querySelector<HTMLElement>('div[role="button"]');
    realButton?.click();
  }

  return (
    <>
      {/* Widget ufficiale Google, fuori dallo schermo: riceve il click reale */}
      <div ref={hiddenContainerRef} style={{ position: "fixed", top: -2000, left: -2000 }} />

      <Button
        onPress={handlePress}
        disabled={disabled}
        opacity={disabled ? 0.5 : 1}
        cursor={disabled ? "not-allowed" : "pointer"}
        backgroundColor={brand.gesso}
        hoverStyle={disabled ? {} : { backgroundColor: brand.filetto }}
        pressStyle={disabled ? {} : { backgroundColor: brand.filetto }}
        color={brand.grafite}
        size="$5"
        borderRadius={999}
        width="100%"
      >
        <XStack alignItems="center" justifyContent="center" gap="$3">
          <GoogleIcon />
          <Text fontSize="$4" fontWeight="600" color={brand.grafite}>
            Continua con Google
          </Text>
        </XStack>
      </Button>
    </>
  );
}
