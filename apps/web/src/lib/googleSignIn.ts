/**
 * Accesso con Google senza script di Google sul sito (docs/CHANGELOG.md
 * §264): la pagina di accesso di Google si apre in una finestra e torna su
 * `/accesso-google`, che consegna il token al pulsante (`GoogleSignInButton`).
 */

export const GOOGLE_SIGNIN_CALLBACK_PATH = "/accesso-google";
export const GOOGLE_SIGNIN_CHANNEL = "google-signin";
/** Accesso iniziato in questa scheda (finestra bloccata): letto da `/accesso-google`. */
export const GOOGLE_SIGNIN_PENDING_KEY = "google-signin-pending";
/** Risultato da consegnare al pulsante quando si torna alla pagina di partenza. */
export const GOOGLE_SIGNIN_RESULT_KEY = "google-signin-result";

export type GoogleSignInPending = { state: string; nonce: string; returnTo: string };

export type GoogleSignInMessage = { type: "google-signin"; state: string; idToken?: string; error?: string };

/** Lo `state` porta anche come si è aperta la pagina di Google: in una finestra (`p`) o al posto della pagina (`r`). */
export function googleSignInUrl({
  clientId,
  origin,
  pending,
  mode,
}: {
  clientId: string;
  origin: string;
  pending: GoogleSignInPending;
  mode: "popup" | "page";
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin + GOOGLE_SIGNIN_CALLBACK_PATH,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: pending.nonce,
    state: `${pending.state}.${mode === "popup" ? "p" : "r"}`,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Lo `state` senza il segno della modalità, e la modalità stessa. */
export function parseGoogleState(raw: string): { state: string; mode: "popup" | "page" } {
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return { state: raw, mode: "popup" };
  return { state: raw.slice(0, dot), mode: raw.slice(dot + 1) === "r" ? "page" : "popup" };
}

/**
 * Il `nonce` scritto da Google nel token: deve essere quello generato al
 * tocco del pulsante, così un token non chiesto da questa pagina viene
 * scartato. Firma, scadenza e destinatario li controlla il server.
 */
export function idTokenNonce(idToken: string): string | null {
  try {
    const part = idToken.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const payload = JSON.parse(json) as { nonce?: unknown };
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}
