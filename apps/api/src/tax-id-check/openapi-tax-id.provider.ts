import { TaxIdProviderUnavailableError, type TaxIdLookup, type TaxIdProvider } from "./tax-id-provider";
import { ViesFirstTaxIdProvider } from "./vies-tax-id.provider";

const TIMEOUT_MS = 8000;

/**
 * Openapi (openapi.com, pagamento a consumo): "Verifica codice fiscale" sulla
 * Risk API (risponde solo `validita: true/false`, non nome e cognome) e
 * "IT-start" sulla Company API per la partita IVA (stato di attività e ragione
 * sociale). Token in `OPENAPI_TOKEN` su Render, mai nel codice;
 * `OPENAPI_SANDBOX=true` usa gli host di prova (dati finti, nessun costo).
 */
export class OpenapiTaxIdProvider implements TaxIdProvider {
  readonly name = "openapi";

  constructor(
    private readonly token: string,
    private readonly sandbox: boolean,
  ) {}

  private host(service: "risk" | "company"): string {
    return `https://${this.sandbox ? "test." : ""}${service}.openapi.com`;
  }

  private async get(url: string): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new TaxIdProviderUnavailableError(`Openapi non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }

  async checkCodiceFiscale(codiceFiscale: string): Promise<TaxIdLookup> {
    const { status, body } = await this.get(`${this.host("risk")}/IT-verifica_cf/${encodeURIComponent(codiceFiscale)}`);
    const validita = readPath(body, ["data", "validita"]);
    if (status === 200 && typeof validita === "boolean") {
      return validita ? { outcome: "VALID" } : { outcome: "INVALID", detail: "INESISTENTE" };
    }
    // Credito finito, token scaduto, errore del servizio: mai un "inesistente" per sbaglio.
    throw new TaxIdProviderUnavailableError(`Openapi verifica_cf: risposta ${status}`);
  }

  async checkPartitaIva(vatNumber: string): Promise<TaxIdLookup> {
    const { status, body } = await this.get(`${this.host("company")}/IT-start/${encodeURIComponent(vatNumber)}`);
    if (status === 404) return { outcome: "REVIEW", detail: "NON TROVATA" };
    if (status !== 200) throw new TaxIdProviderUnavailableError(`Openapi IT-start: risposta ${status}`);
    const rawData = readPath(body, ["data"]);
    const data = Array.isArray(rawData) ? rawData[0] : rawData;
    if (!data || typeof data !== "object") return { outcome: "REVIEW", detail: "NON TROVATA" };
    const activity = String((data as Record<string, unknown>).activityStatus ?? "").trim().toUpperCase();
    const companyName = (data as Record<string, unknown>).companyName;
    const officialName = typeof companyName === "string" && companyName.trim() ? companyName.trim() : null;
    return { outcome: partitaIvaOutcome(activity), detail: activity || null, officialName };
  }
}

/** "ATTIVA" → valida; cessata/cancellata → da correggere; altro (sospesa, in liquidazione, vuoto) → la guarda un admin. */
export function partitaIvaOutcome(activityStatus: string): TaxIdLookup["outcome"] {
  if (activityStatus === "ATTIVA") return "VALID";
  if (/CESSAT|CANCELLAT/.test(activityStatus)) return "INVALID";
  return "REVIEW";
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Il fornitore configurato su questo ambiente, o `null` se mancano le chiavi
 * (nessun controllo, nessun blocco). La partita IVA passa prima da VIES
 * (gratis) e arriva a Openapi solo se VIES non la conferma (§244).
 */
export function taxIdProviderFromEnv(): TaxIdProvider | null {
  const token = process.env.OPENAPI_TOKEN?.trim();
  if (!token) return null;
  return new ViesFirstTaxIdProvider(new OpenapiTaxIdProvider(token, process.env.OPENAPI_SANDBOX === "true"));
}
