/**
 * Percorso interno sicuro per il ritorno dopo l'accesso (`?redirect=`).
 * Accetta solo un percorso del sito ("/qualcosa"), mai un altro sito
 * ("https://…", "//host", "/\host"), "javascript:" o caratteri di
 * controllo: un link fatto apposta non deve portare fuori dal sito chi si
 * è appena autenticato (docs/CHANGELOG.md §283). `null` se non è sicuro.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (value.startsWith("//")) return null;
  try {
    const base = "https://interno.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
