import type { TaxIdLookup, TaxIdProvider } from "./tax-id-provider";

/** VIES a volte è lento: oltre questo tempo si passa subito al fornitore a pagamento. */
const VIES_TIMEOUT_MS = 5000;
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat";

/**
 * Esito di VIES (Commissione europea, gratuito, nessuna chiave): `VALID` se la
 * partita IVA risulta attiva, `null` in ogni altro caso. Un "non valida" di
 * VIES non basta per dire che è sbagliata: in Italia ci sono solo le partite
 * IVA abilitate agli scambi con l'estero, e molti artigiani non lo sono.
 */
export async function viesLookup(vatNumber: string, fetchImpl: typeof fetch = fetch): Promise<TaxIdLookup | null> {
  try {
    const response = await fetchImpl(`${VIES_URL}/${encodeURIComponent(vatNumber)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(VIES_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { isValid?: unknown; name?: unknown } | null;
    if (body?.isValid !== true) return null;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    return { outcome: "VALID", detail: "ATTIVA", officialName: name && name !== "---" ? name : null, source: "vies" };
  } catch {
    return null;
  }
}

/**
 * Prima VIES (gratis), poi il fornitore a pagamento solo se VIES non conferma
 * (decisione dell'utente, docs/CHANGELOG.md §247): non valida, lenta o che non
 * risponde. Il codice fiscale va sempre al fornitore a pagamento: VIES non lo
 * controlla.
 */
export class ViesFirstTaxIdProvider implements TaxIdProvider {
  readonly name: string;

  constructor(
    private readonly fallback: TaxIdProvider,
    private readonly lookup: (vatNumber: string) => Promise<TaxIdLookup | null> = viesLookup,
  ) {
    this.name = fallback.name;
  }

  checkCodiceFiscale(codiceFiscale: string): Promise<TaxIdLookup> {
    return this.fallback.checkCodiceFiscale(codiceFiscale);
  }

  async checkPartitaIva(vatNumber: string): Promise<TaxIdLookup> {
    const vies = await this.lookup(vatNumber);
    if (vies) return vies;
    return this.fallback.checkPartitaIva(vatNumber);
  }
}
