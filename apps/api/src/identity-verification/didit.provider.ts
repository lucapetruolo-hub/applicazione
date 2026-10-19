import { createHmac, timingSafeEqual } from "node:crypto";
import { IdentityProviderError, type DocumentPerson, type IdentityDecision, type IdentityProvider } from "./identity-provider";

const API = "https://verification.didit.me/v3";
const TIMEOUT_MS = 10_000;
/** Il webhook è valido solo se firmato da meno di 5 minuti (come consiglia Didit). */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Didit (didit.me): documento (CIE, patente, passaporto) + selfie con prova
 * di vita, su una pagina ospitata da Didit. Chiavi su Render:
 * `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` (il flusso "documento + selfie"
 * creato nella console Didit) e `DIDIT_WEBHOOK_SECRET`. Foto e selfie
 * restano a Didit: noi leggiamo solo l'esito e i dati per il confronto.
 */
export class DiditIdentityProvider implements IdentityProvider {
  readonly name = "didit";

  constructor(
    private readonly apiKey: string,
    private readonly workflowId: string,
    private readonly webhookSecret: string | null,
  ) {}

  consoleUrl(): string | null {
    return "https://business.didit.me";
  }

  private async call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        ...init,
        headers: { "x-api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new IdentityProviderError(`Didit non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !body) throw new IdentityProviderError(`Didit ${path}: risposta ${response.status}`);
    return body;
  }

  async createSession(input: { reference: string; callbackUrl: string }): Promise<{ sessionId: string; url: string }> {
    const body = await this.call("/session/", {
      method: "POST",
      body: JSON.stringify({ workflow_id: this.workflowId, vendor_data: input.reference, callback: input.callbackUrl, language: "it" }),
    });
    const sessionId = body.session_id;
    const url = body.url;
    if (typeof sessionId !== "string" || typeof url !== "string") throw new IdentityProviderError("Didit: sessione senza id o link.");
    return { sessionId, url };
  }

  async getDecision(sessionId: string): Promise<IdentityDecision> {
    const body = await this.call(`/session/${encodeURIComponent(sessionId)}/decision/`);
    return diditDecision(body);
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, now: Date = new Date()): string | null {
    if (!this.webhookSecret) return null;
    const header = (name: string) => {
      const value = headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const timestamp = Number(header("x-timestamp"));
    if (!Number.isFinite(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return null;
    const raw = rawBody.toString("utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const sign = (content: string) => createHmac("sha256", this.webhookSecret as string).update(content, "utf8").digest("hex");
    const signatureV2 = header("x-signature-v2");
    const signature = header("x-signature");
    const valid = (signatureV2 && safeEqual(signatureV2, sign(canonicalJson(parsed)))) || (signature && safeEqual(signature, sign(raw)));
    if (!valid) return null;
    const sessionId = (parsed as Record<string, unknown>)?.session_id;
    return typeof sessionId === "string" ? sessionId : null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase());
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** JSON con chiavi ordinate e senza spazi, come lo firma Didit per `X-Signature-V2`. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Risposta "decision" di Didit → esito per il sito. */
export function diditDecision(body: Record<string, unknown>): IdentityDecision {
  const providerStatus = str(body.status) ?? "Unknown";
  const outcome: IdentityDecision["outcome"] =
    providerStatus === "Approved"
      ? "APPROVED"
      : providerStatus === "Declined"
        ? "DECLINED"
        : providerStatus === "In Review"
          ? "REVIEW"
          : providerStatus === "Abandoned" || providerStatus === "Expired" || providerStatus === "Kyc Expired"
            ? "EXPIRED"
            : providerStatus === "Not Started" || providerStatus === "In Progress" || providerStatus === "Awaiting User" || providerStatus === "Resubmitted"
              ? "IN_PROGRESS"
              : "PROCESSING";
  const list = body.id_verifications ?? (body.decision as Record<string, unknown> | undefined)?.id_verifications;
  const single = body.id_verification ?? (body.decision as Record<string, unknown> | undefined)?.id_verification;
  const entry = (Array.isArray(list) ? list[0] : single) as Record<string, unknown> | undefined;
  const person: DocumentPerson | null = entry
    ? {
        firstName: str(entry.first_name),
        lastName: str(entry.last_name),
        dateOfBirth: str(entry.date_of_birth),
        personalNumber: str(entry.personal_number) ?? str(entry.tax_number),
      }
    : null;
  return { providerStatus, outcome, person };
}
