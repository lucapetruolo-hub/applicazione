import { Logger } from "@nestjs/common";

const TIMEOUT_MS = 15_000;

/** Esito che ci interessa di una fattura inviata. */
export type SdiDeliveryStatus = "SENT" | "DELIVERED" | "REJECTED";

export type SdiNotification = { sdiId: string; status: SdiDeliveryStatus; message: string | null };

/** La nostra società presso il fornitore: partita IVA, ragione sociale, email per la conservazione. */
export type SdiCompany = { fiscalId: string; name: string; email: string };

/**
 * Invio delle nostre fatture allo SdI tramite un intermediario (docs/CHANGELOG.md
 * §378, §379). Sostituibile come `TaxIdProvider` e `IdentityProvider`.
 */
export interface SdiProvider {
  readonly name: string;
  /** Ambiente di prova del fornitore: niente arriva davvero all'Agenzia. */
  readonly sandbox: boolean;
  /** Registra la nostra società presso il fornitore, se non c'è già (una volta sola). */
  ensureRegistered(company: SdiCompany): Promise<void>;
  /** Manda l'XML; ritorna l'identificativo del fornitore. Lancia se non riesce. */
  send(xml: string): Promise<{ sdiId: string }>;
  /** Esito di una fattura inviata (consegnata, scartata), o null se non è ancora arrivato. */
  outcome(sdiId: string): Promise<SdiNotification | null>;
  /** Solo nella prova: fa arrivare un esito finto (RC consegnata, NS scartata). */
  simulateOutcome(sdiId: string, type: "RC" | "NS"): Promise<void>;
}

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}

function errorOf(status: number, body: unknown): string {
  const message = readPath(body, ["message"]) ?? readPath(body, ["error"]);
  return `risposta ${status}${typeof message === "string" && message ? ` (${message})` : ""}`;
}

/**
 * Motivo dello scarto dalla notifica NS: `lista_errori.Errore` è un errore
 * solo o un elenco, con `Codice` e `Descrizione` come nell'XML dello SdI.
 */
export function sdiRejectionMessage(message: unknown): string | null {
  const raw = readPath(message, ["lista_errori", "Errore"]);
  const errors = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const parts = errors
    .map((e) => {
      const code = readPath(e, ["Codice"]);
      const description = readPath(e, ["Descrizione"]);
      if (typeof description !== "string" || !description) return null;
      return typeof code === "string" && code ? `${code}: ${description}` : description;
    })
    .filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * L'esito che decide, dalle notifiche di una fattura (`GET
 * /invoices_notifications/{uuid}`): vale l'ultima ricevuta RC, MC o NS.
 */
export function sdiOutcomeFromNotifications(sdiId: string, body: unknown): SdiNotification | null {
  const items = readPath(body, ["data"]);
  if (!Array.isArray(items)) return null;
  const sorted = [...items].sort((a, b) => String(readPath(a, ["created_at"]) ?? "").localeCompare(String(readPath(b, ["created_at"]) ?? "")));
  let result: SdiNotification | null = null;
  for (const item of sorted) {
    const status = sdiOutcome(String(readPath(item, ["type"]) ?? "").toUpperCase());
    if (!status) continue;
    const message = readPath(item, ["message"]);
    result = { sdiId, status, message: status === "REJECTED" ? sdiRejectionMessage(message) : null };
  }
  return result;
}

/**
 * Openapi "SDI" (pagamento a consumo, stesso fornitore della verifica del
 * codice fiscale), come nella sua documentazione (console.openapi.com,
 * sdi.openapi.json, letta il 27/10/2026): prima la società si registra una
 * volta (`/business_registry_configurations`, con la conservazione a norma),
 * poi ogni fattura parte con `POST /invoices_legal_storage` (XML nel corpo,
 * risposta `data.uuid`) e il suo esito si legge con
 * `GET /invoices_notifications/{uuid}`. Token `OPENAPI_TOKEN_SDI` su
 * Render, mai nel codice; `OPENAPI_SANDBOX=true` usa l'host di prova, dove
 * `POST /simulate/customer-notification` fa arrivare un esito finto.
 */
export class OpenapiSdiProvider implements SdiProvider {
  readonly name = "openapi";
  private readonly logger = new Logger(OpenapiSdiProvider.name);
  private readonly registered = new Set<string>();

  constructor(
    private readonly token: string,
    readonly sandbox: boolean,
  ) {}

  private host(): string {
    return `https://${this.sandbox ? "test." : ""}sdi.openapi.it`;
  }

  private async call(path: string, init: { method?: string; body?: string; contentType?: string } = {}): Promise<{ status: number; ok: boolean; body: unknown }> {
    const response = await fetch(`${this.host()}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...(init.contentType ? { "Content-Type": init.contentType } : {}) },
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body };
  }

  async ensureRegistered(company: SdiCompany): Promise<void> {
    if (this.registered.has(company.fiscalId)) return;
    const existing = await this.call(`/business_registry_configurations/${encodeURIComponent(company.fiscalId)}`);
    if (existing.ok) {
      // Senza credito Openapi sospende la società: va ricaricato il credito e riattivata.
      if (readPath(existing.body, ["data", "active"]) === false) throw new Error("Openapi SDI: la società è sospesa (credito finito?). Ricarica il credito su Openapi e riattivala.");
      this.registered.add(company.fiscalId);
      return;
    }
    if (existing.status !== 404) throw new Error(`Openapi SDI, registrazione della società: ${errorOf(existing.status, existing.body)}`);
    const created = await this.call("/business_registry_configurations", {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ fiscal_id: company.fiscalId, name: company.name, email: company.email, apply_signature: false, apply_legal_storage: true }),
    });
    if (!created.ok) throw new Error(`Openapi SDI, registrazione della società: ${errorOf(created.status, created.body)}`);
    this.logger.log(`Openapi SDI: società ${company.fiscalId} registrata${this.sandbox ? " (prova)" : ""}.`);
    this.registered.add(company.fiscalId);
  }

  async send(xml: string): Promise<{ sdiId: string }> {
    const result = await this.call("/invoices_legal_storage", { method: "POST", contentType: "application/xml", body: xml });
    if (!result.ok) throw new Error(`Openapi SDI: ${errorOf(result.status, result.body)}`);
    const uuid = readPath(result.body, ["data", "uuid"]);
    if (typeof uuid !== "string" || !uuid) throw new Error("Openapi SDI: risposta senza identificativo della fattura");
    return { sdiId: uuid };
  }

  async outcome(sdiId: string): Promise<SdiNotification | null> {
    const result = await this.call(`/invoices_notifications/${encodeURIComponent(sdiId)}`);
    if (result.status === 404) return null;
    if (!result.ok) throw new Error(`Openapi SDI, esito: ${errorOf(result.status, result.body)}`);
    return sdiOutcomeFromNotifications(sdiId, result.body);
  }

  async simulateOutcome(sdiId: string, type: "RC" | "NS"): Promise<void> {
    if (!this.sandbox) throw new Error("La simulazione degli esiti esiste solo nella prova di Openapi.");
    const result = await this.call("/simulate/customer-notification", { method: "POST", contentType: "application/json", body: JSON.stringify({ uuid: sdiId, notification: type }) });
    if (!result.ok) throw new Error(`Openapi SDI, simulazione: ${errorOf(result.status, result.body)}`);
  }
}

/**
 * Codici delle ricevute SdI: RC consegnata, MC non consegnata ma messa a
 * disposizione nell'area riservata (per noi è a posto), NS scartata.
 */
export function sdiOutcome(type: string): SdiDeliveryStatus | null {
  if (type === "RC" || type === "MC") return "DELIVERED";
  if (type === "NS") return "REJECTED";
  return null;
}

/** Il fornitore configurato, o null senza chiave: le fatture restano da scaricare in XML. */
export function sdiProviderFromEnv(env: NodeJS.ProcessEnv = process.env): SdiProvider | null {
  const token = env.OPENAPI_TOKEN_SDI?.trim();
  if (!token) return null;
  return new OpenapiSdiProvider(token, env.OPENAPI_SANDBOX === "true");
}
