import { Logger } from "@nestjs/common";

const TIMEOUT_MS = 15_000;

/** Esito che ci interessa di una fattura inviata. */
export type SdiDeliveryStatus = "SENT" | "DELIVERED" | "REJECTED";

export type SdiNotification = { sdiId: string; status: SdiDeliveryStatus; message: string | null };

/**
 * Invio delle nostre fatture allo SdI tramite un intermediario (docs/CHANGELOG.md
 * §372). Sostituibile come `TaxIdProvider` e `IdentityProvider`.
 */
export interface SdiProvider {
  readonly name: string;
  /** Manda l'XML; ritorna l'identificativo del fornitore. Lancia se non riesce. */
  send(xml: string, fileName: string): Promise<{ sdiId: string }>;
  /** Esiti arrivati dall'ultima lettura (consegnata, scartata). */
  notifications(): Promise<SdiNotification[]>;
}

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), value);
}

/**
 * Openapi "SDI" (pagamento a consumo, stesso fornitore della verifica del
 * codice fiscale): invio con conservazione a norma
 * (`POST /invoices_legal_storage`, XML nel corpo) e lettura degli esiti
 * (`GET /invoices_notifications`). Token `OPENAPI_TOKEN_SDI` su Render, mai
 * nel codice; `OPENAPI_SANDBOX=true` usa l'host di prova. Prima del lancio va
 * provato nella prova di Openapi con la partita IVA della società
 * (checklist di lancio): la forma delle risposte qui è letta con prudenza.
 */
export class OpenapiSdiProvider implements SdiProvider {
  readonly name = "openapi";
  private readonly logger = new Logger(OpenapiSdiProvider.name);

  constructor(
    private readonly token: string,
    private readonly sandbox: boolean,
  ) {}

  private host(): string {
    return `https://${this.sandbox ? "test." : ""}sdi.openapi.it`;
  }

  async send(xml: string, fileName: string): Promise<{ sdiId: string }> {
    const response = await fetch(`${this.host()}/invoices_legal_storage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/xml", Accept: "application/json", "X-File-Name": fileName },
      body: xml,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = readPath(body, ["message"]) ?? readPath(body, ["error"]);
      throw new Error(`Openapi SDI: risposta ${response.status}${typeof message === "string" ? ` (${message})` : ""}`);
    }
    const uuid = readPath(body, ["data", "uuid"]) ?? readPath(body, ["uuid"]) ?? readPath(body, ["data", "id"]);
    if (typeof uuid !== "string" || !uuid) throw new Error("Openapi SDI: risposta senza identificativo della fattura");
    return { sdiId: uuid };
  }

  async notifications(): Promise<SdiNotification[]> {
    const response = await fetch(`${this.host()}/invoices_notifications`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Openapi SDI notifiche: risposta ${response.status}`);
    const body = await response.json().catch(() => null);
    const items = readPath(body, ["data"]);
    if (!Array.isArray(items)) {
      this.logger.warn("Openapi SDI: notifiche in una forma inattesa, nessun esito aggiornato.");
      return [];
    }
    return items.flatMap((item): SdiNotification[] => {
      const sdiId = readPath(item, ["invoice_uuid"]) ?? readPath(item, ["invoice", "uuid"]) ?? readPath(item, ["uuid"]);
      const type = String(readPath(item, ["type"]) ?? readPath(item, ["notification_type"]) ?? readPath(item, ["message", "type"]) ?? "").toUpperCase();
      if (typeof sdiId !== "string" || !type) return [];
      const status = sdiOutcome(type);
      if (!status) return [];
      const description = readPath(item, ["message", "description"]) ?? readPath(item, ["description"]);
      return [{ sdiId, status, message: typeof description === "string" ? description : null }];
    });
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
