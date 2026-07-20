"use client";

import { useEffect, useRef } from "react";

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

/**
 * Renderizza il bottone "Continua con Google" solo se
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID è configurato — niente pulsanti che non
 * funzionano (vedi CLAUDE.md §8).
 */
export function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientId) return;

    function renderButton() {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
        locale: "it",
      });
    }

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
  }, [clientId, onCredential]);

  if (!clientId) {
    return null;
  }

  return <div ref={containerRef} />;
}
