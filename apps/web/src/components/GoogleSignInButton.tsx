"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Text, XStack, brand } from "@professionisti/ui";
import {
  GOOGLE_SIGNIN_CHANNEL,
  GOOGLE_SIGNIN_PENDING_KEY,
  GOOGLE_SIGNIN_RESULT_KEY,
  googleSignInUrl,
  idTokenNonce,
  type GoogleSignInMessage,
  type GoogleSignInPending,
} from "@/lib/googleSignIn";

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
 * Pulsante "Continua con Google" (pillola, larghezza piena, icona ufficiale).
 *
 * Dal docs/CHANGELOG.md §265 (richiesta dell'utente: Google senza dover
 * accettare i cookie) non carica più nessuno script di Google sul sito: apre
 * la pagina di accesso di Google in una finestra (OpenID Connect, risposta
 * `id_token` con `nonce`) che torna su `/accesso-google`; da lì il token
 * arriva a questa pagina e segue lo stesso percorso di prima
 * (`POST /auth/google/verify`, firma e destinatario controllati dal server).
 * Così il consenso del banner cookie non serve più. Se il browser blocca la
 * finestra, la stessa pagina di Google si apre al posto di quella corrente e
 * al ritorno il token viene consegnato qui (`GOOGLE_SIGNIN_RESULT_KEY`).
 */
export function GoogleSignInButton({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  // Funzione sempre aggiornata senza rifare gli ascoltatori a ogni render del genitore.
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  const pendingRef = useRef<GoogleSignInPending | null>(null);
  const [notice, setNotice] = useState<"waiting" | "error" | null>(null);

  useEffect(() => {
    function deliver(message: GoogleSignInMessage) {
      const pending = pendingRef.current;
      if (!pending || message.state !== pending.state) return;
      pendingRef.current = null;
      if (!message.idToken) {
        setNotice(message.error === "access_denied" ? null : "error");
        return;
      }
      if (idTokenNonce(message.idToken) !== pending.nonce) {
        setNotice("error");
        return;
      }
      setNotice(null);
      onCredentialRef.current(message.idToken);
    }

    // Ritorno dalla pagina di Google aperta al posto di questa (finestra bloccata).
    try {
      const raw = sessionStorage.getItem(GOOGLE_SIGNIN_RESULT_KEY);
      if (raw) {
        const result = JSON.parse(raw) as GoogleSignInMessage & { pending: GoogleSignInPending };
        if (result.pending.returnTo === window.location.pathname + window.location.search) {
          sessionStorage.removeItem(GOOGLE_SIGNIN_RESULT_KEY);
          pendingRef.current = result.pending;
          deliver(result);
        }
      }
    } catch {
      // sessionStorage non disponibile: niente da consegnare.
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as GoogleSignInMessage | undefined;
      if (data?.type === "google-signin") deliver(data);
    }
    window.addEventListener("message", onMessage);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(GOOGLE_SIGNIN_CHANNEL);
      channel.onmessage = (event: MessageEvent<GoogleSignInMessage>) => {
        if (event.data?.type === "google-signin") deliver(event.data);
      };
    }
    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, []);

  if (!clientId) {
    return null;
  }

  function handlePress() {
    if (disabled || !clientId) return;
    const random = () => crypto.randomUUID().replace(/-/g, "");
    const pending: GoogleSignInPending = {
      state: random(),
      nonce: random(),
      returnTo: window.location.pathname + window.location.search,
    };
    pendingRef.current = pending;
    const url = (mode: "popup" | "page") => googleSignInUrl({ clientId, origin: window.location.origin, pending, mode });
    const width = 480;
    const height = 640;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const popup = window.open(url("popup"), "google-signin", `popup,width=${width},height=${height},left=${left},top=${top}`);
    if (popup) {
      setNotice("waiting");
      return;
    }
    // Finestra bloccata: si va da Google con questa pagina e si torna qui.
    try {
      sessionStorage.setItem(GOOGLE_SIGNIN_PENDING_KEY, JSON.stringify(pending));
    } catch {
      // senza sessionStorage al ritorno si rientra nella pagina ma senza accesso
    }
    window.location.assign(url("page"));
  }

  return (
    <>
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
          <Text fontSize={16} fontWeight="600" color={brand.grafite}>
            Continua con Google
          </Text>
        </XStack>
      </Button>
      {notice === "waiting" ? (
        <Text fontSize={13} color={brand.grafite70} textAlign="center" role="status">
          Continua nella finestra di Google.
        </Text>
      ) : notice === "error" ? (
        <Text fontSize={13} color={brand.urgenza} textAlign="center" role="alert">
          Accesso con Google non riuscito. Riprova.
        </Text>
      ) : null}
    </>
  );
}
