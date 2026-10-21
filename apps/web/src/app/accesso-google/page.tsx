"use client";

import { useEffect, useState } from "react";
import { safeInternalPath } from "@professionisti/shared";
import { Surface, Text, YStack, brand, radiusDocLg } from "@professionisti/ui";
import {
  GOOGLE_SIGNIN_CHANNEL,
  GOOGLE_SIGNIN_PENDING_KEY,
  GOOGLE_SIGNIN_RESULT_KEY,
  parseGoogleState,
  type GoogleSignInMessage,
  type GoogleSignInPending,
} from "@/lib/googleSignIn";

/**
 * Ritorno dalla pagina di accesso di Google (docs/CHANGELOG.md §265): il
 * token arriva nel frammento dell'indirizzo (`#id_token=...&state=...`), che
 * non raggiunge mai un server. Se l'accesso è partito in una finestra il
 * token va alla pagina che l'ha aperta e la finestra si chiude; se è partito
 * al posto della pagina (finestra bloccata) si torna alla pagina di partenza.
 */
export default function AccessoGooglePage() {
  const [outcome, setOutcome] = useState<"working" | "close" | "error">("working");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Il token non resta nella cronologia del browser.
    window.history.replaceState(null, "", window.location.pathname);
    const rawState = params.get("state");
    if (!rawState) {
      setOutcome("error");
      return;
    }
    const { state, mode } = parseGoogleState(rawState);
    const message: GoogleSignInMessage = {
      type: "google-signin",
      state,
      idToken: params.get("id_token") ?? undefined,
      error: params.get("error") ?? undefined,
    };

    if (mode === "page") {
      try {
        const pending = JSON.parse(sessionStorage.getItem(GOOGLE_SIGNIN_PENDING_KEY) ?? "null") as GoogleSignInPending | null;
        sessionStorage.removeItem(GOOGLE_SIGNIN_PENDING_KEY);
        const returnTo = pending && pending.state === state ? safeInternalPath(pending.returnTo) : null;
        if (pending && returnTo) {
          sessionStorage.setItem(GOOGLE_SIGNIN_RESULT_KEY, JSON.stringify({ ...message, pending }));
          window.location.replace(returnTo);
          return;
        }
      } catch {
        // continua sotto con l'errore
      }
      setOutcome("error");
      return;
    }

    if (window.opener && window.opener !== window) {
      try {
        (window.opener as Window).postMessage(message, window.location.origin);
      } catch {
        // la pagina di partenza riceve comunque il messaggio sotto
      }
    }
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(GOOGLE_SIGNIN_CHANNEL);
      channel.postMessage(message);
      channel.close();
    }
    setOutcome("close");
    window.close();
  }, []);

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
      <Surface floating width="100%" maxWidth={400} borderRadius={radiusDocLg} padding="$6" gap="$3">
        <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          {outcome === "error" ? "Accesso non riuscito" : outcome === "close" ? "Fatto" : "Un attimo..."}
        </Text>
        <Text fontSize="$3" color={brand.grafite70} textAlign="center">
          {outcome === "error"
            ? "Torna alla pagina di prima e tocca di nuovo “Continua con Google”."
            : outcome === "close"
              ? "Puoi chiudere questa finestra e tornare alla pagina di prima."
              : "Ti stiamo collegando con Google."}
        </Text>
      </Surface>
    </YStack>
  );
}
