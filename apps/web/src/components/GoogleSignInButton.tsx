"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Text, XStack, brand } from "@professionisti/ui";
import { COOKIE_CONSENT_ACCEPTED_EVENT, grantCookieConsent, hasCookieConsent } from "@/lib/cookieConsent";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
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
 *
 * Senza consenso il pulsante non restava muto (docs/CHANGELOG.md §214, bug
 * segnalato dall'utente nella richiesta di preventivo da non loggato, dove
 * il banner cookie resta sotto la finestra di accesso): toccandolo compare
 * la richiesta di consenso ai servizi Google, con "Accetta e continua";
 * dopo il consenso compare direttamente il pulsante originale di Google,
 * così basta un tocco (Google apre la sua finestra solo da un tocco diretto
 * sul suo pulsante).
 */
export function GoogleSignInButton({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  // Funzione sempre aggiornata senza rifare il pulsante Google a ogni render
  // del genitore (prima veniva reinizializzato a ogni lettera digitata).
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<"consent" | "loading" | null>(null);
  // Consenso dato da qui: al posto del nostro pulsante si mostra quello originale di Google.
  const [showOfficial, setShowOfficial] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    function renderButton() {
      if (!window.google || !hiddenContainerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: (response) => onCredentialRef.current(response.credential),
      });
      window.google.accounts.id.renderButton(hiddenContainerRef.current, {
        theme: "outline",
        size: "large",
        width: Math.min(400, Math.max(200, hiddenContainerRef.current.offsetWidth || 320)),
        text: "continue_with",
        locale: "it",
        shape: "pill",
      });
      setReady(true);
      // Consenso appena dato o script appena caricato: il primo tocco non ha
      // potuto aprire Google, si mostra il pulsante originale da toccare.
      setNotice((current) => {
        if (current) setShowOfficial(true);
        return null;
      });
    }

    function loadScript() {
      const scriptId = "google-identity-services";
      const existing = document.getElementById(scriptId);
      if (existing) {
        if (window.google) renderButton();
        else existing.addEventListener("load", renderButton);
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
  }, [clientId]);

  if (!clientId) {
    return null;
  }

  function handlePress() {
    if (disabled) return;
    if (!hasCookieConsent()) {
      setNotice("consent");
      return;
    }
    const realButton = hiddenContainerRef.current?.querySelector<HTMLElement>('div[role="button"]');
    if (!ready || !realButton) {
      setNotice("loading");
      return;
    }
    setNotice(null);
    realButton.click();
  }

  return (
    <>
      {/* Widget ufficiale Google: fuori dallo schermo riceve il click inoltrato
          dal nostro pulsante; dopo il consenso dato da qui è visibile. */}
      <div
        ref={hiddenContainerRef}
        style={
          showOfficial
            ? {
                display: "flex",
                justifyContent: "center",
                width: "100%",
                minHeight: 44,
              }
            : { position: "fixed", top: -2000, left: -2000, width: 320 }
        }
      />

      {showOfficial ? null : (
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
      )}
      {notice === "consent" ? (
        <Text fontSize="$2" color={brand.grafite70} textAlign="center" role="alert">
          Per accedere con Google serve il tuo consenso ai servizi Google (lo stesso del banner dei cookie).{" "}
          <Text
            accessibilityRole="button"
            fontSize="$2"
            fontWeight="700"
            color={brand.grafite}
            textDecorationLine="underline"
            cursor="pointer"
            onPress={() => {
              setNotice("loading");
              grantCookieConsent();
            }}
          >
            Accetta e continua
          </Text>
        </Text>
      ) : notice === "loading" ? (
        <Text fontSize="$2" color={brand.grafite70} textAlign="center" role="status">
          Sto collegando Google, un attimo...
        </Text>
      ) : null}
    </>
  );
}
