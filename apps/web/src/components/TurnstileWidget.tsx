"use client";

import { useEffect, useRef } from "react";

type TurnstileRenderOptions = {
  sitekey: string;
  language?: string;
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = "cloudflare-turnstile";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** True quando l'anti-bot è attivo (chiave del sito impostata su Vercel). */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

function loadScript(onReady: () => void) {
  if (window.turnstile) {
    onReady();
    return;
  }
  let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }
  script.addEventListener("load", onReady, { once: true });
}

/**
 * Anti-bot Cloudflare Turnstile su registrazione con email e password,
 * recupero password e contatti (checklist di lancio punto 24,
 * docs/CHANGELOG.md §199). Senza
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` non mostra nulla e non carica nessuno
 * script, come Maps e Google Sign-In senza chiave.
 *
 * Nessun consenso cookie richiesto: Turnstile non usa cookie di
 * profilazione (citato nell'informativa privacy). Di norma resta invisibile
 * ("interaction-only") e compare solo se Cloudflare chiede una conferma.
 *
 * Il token vale una volta sola: dopo un invio fallito il genitore incrementa
 * `resetSignal` per ottenerne uno nuovo.
 */
export function TurnstileWidget({
  onTokenChange,
  resetSignal = 0,
}: {
  onTokenChange: (token: string | null) => void;
  resetSignal?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadScript(() => {
      if (cancelled || !window.turnstile || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        language: "it",
        size: "flexible",
        appearance: "interaction-only",
        callback: (token) => onTokenChangeRef.current(token),
        "expired-callback": () => onTokenChangeRef.current(null),
        "error-callback": () => onTokenChangeRef.current(null),
      });
    });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal === 0 || !widgetIdRef.current || !window.turnstile) return;
    onTokenChangeRef.current(null);
    window.turnstile.reset(widgetIdRef.current);
  }, [resetSignal]);

  if (!siteKey) return null;
  // `display: contents`: finché Cloudflare non mostra nulla il contenitore
  // non conta come elemento dello stack e non aggiunge spazio vuoto.
  return <div ref={containerRef} style={{ display: "contents" }} />;
}

/** Messaggio quando si invia il modulo prima che la verifica sia pronta. */
export const TURNSTILE_PENDING_MESSAGE = "Un attimo: stiamo verificando che non sei un robot. Riprova tra qualche secondo.";
