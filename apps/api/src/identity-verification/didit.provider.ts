import { createHmac, timingSafeEqual } from "node:crypto";
import { IdentityProviderError, type DocumentPerson, type ExpectedDocumentPerson, type IdentityDecision, type IdentityProvider } from "./identity-provider";

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
    /**
     * `DIDIT_SANDBOX=true` su Render con la chiave di un'applicazione Didit
     * in modalità prova: Didit approva con dati finti (sempre nato il
     * 15/06/1990), quindi il nostro confronto con i dati fiscali fallirebbe
     * sempre (docs/CHANGELOG.md §272). Da togliere con la chiave vera.
     */
    readonly sandbox = false,
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

  async createSession(input: { reference: string; callbackUrl: string; expected?: ExpectedDocumentPerson }): Promise<{ sessionId: string; url: string }> {
    // Didit confronta anche lui nome e data con il documento e lo segnala negli avvisi.
    // Non in prova: Didit restituisce sempre la stessa data di nascita finta
    // (15/06/1990) e rifiuterebbe ogni verifica per "data diversa" (§277).
    const expected = this.sandbox ? undefined : input.expected;
    const expectedDetails = expected
      ? Object.fromEntries(
          Object.entries({ first_name: expected.firstName, last_name: expected.lastName, date_of_birth: expected.dateOfBirth?.slice(0, 10) }).filter(([, value]) => !!value),
        )
      : {};
    const body = await this.call("/session/", {
      method: "POST",
      body: JSON.stringify({
        workflow_id: this.workflowId,
        vendor_data: input.reference,
        callback: input.callbackUrl,
        language: "it",
        ...(Object.keys(expectedDetails).length > 0 ? { expected_details: expectedDetails } : {}),
      }),
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

const OUTCOMES: Record<string, IdentityDecision["outcome"]> = {
  approved: "APPROVED",
  declined: "DECLINED",
  "in review": "REVIEW",
  abandoned: "EXPIRED",
  expired: "EXPIRED",
  "kyc expired": "EXPIRED",
  "not started": "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  "awaiting user": "IN_PROGRESS",
  resubmitted: "IN_PROGRESS",
};

/** Avvisi di Didit (`warnings[]`, a livello di sessione e di ogni controllo): solo i codici, mai i dati della persona. */
function diditWarnings(body: Record<string, unknown>): string[] {
  const codes = new Set<string>();
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const warning of value) {
      // Gli avvisi solo informativi non pesano sull'esito.
      if (str((warning as Record<string, unknown> | null)?.log_type)?.toLowerCase() === "information") continue;
      const code = str((warning as Record<string, unknown> | null)?.risk) ?? str((warning as Record<string, unknown> | null)?.short_description);
      if (code) codes.add(code);
    }
  };
  const decision = (body.decision as Record<string, unknown> | undefined) ?? body;
  collect(decision.warnings);
  for (const key of ["id_verifications", "liveness_checks", "face_matches", "id_verification", "liveness", "face_match"]) {
    const value = decision[key];
    for (const item of Array.isArray(value) ? value : value ? [value] : []) collect((item as Record<string, unknown>).warnings);
  }
  return [...codes].slice(0, 10);
}

/** Risposta "decision" di Didit → esito per il sito. */
export function diditDecision(body: Record<string, unknown>): IdentityDecision {
  const providerStatus = str(body.status) ?? "Unknown";
  // Didit scrive lo stato a volte "In Review", a volte "IN_REVIEW": si confronta senza maiuscole né trattini bassi.
  const outcome = OUTCOMES[providerStatus.toLowerCase().replace(/_/g, " ")] ?? "PROCESSING";
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
  const warnings = diditWarnings(body);
  return { providerStatus, outcome, person, warnings, reason: diditReason(warnings) };
}

/**
 * Motivo del rifiuto per il professionista, dal primo avviso riconosciuto
 * (codici di Didit, docs.didit.me "warnings"; miglioria scelta dall'utente,
 * docs/CHANGELOG.md §272). Frasi brevi che dicono cosa rifare; l'ordine
 * conta: prima i motivi che non si risolvono rifacendo la foto.
 */
const REASONS: [RegExp, string][] = [
  [/MINIMUM_AGE|AGE_BELOW/, "Per lavorare sul sito serve avere almeno 18 anni."],
  [/DOCUMENT_EXPIRED/, "Il documento è scaduto: rifai la verifica con un documento valido."],
  [/DUPLICATED|BLOCKLIST/, "Questo documento o questo volto risultano già usati per un altro account: scrivici dalla pagina Contatti."],
  [/SCREEN_CAPTURE|PRINTED_COPY|PUBLIC_DOCUMENT|PORTRAIT_MANIPULATION/, "Serve il documento originale: non una foto presa da uno schermo né una fotocopia."],
  [/NOT_SUPPORTED|COULD_NOT_RECOGNIZE|COULD_NOT_DETECT_DOCUMENT_TYPE|HAS_NO_PORTRAIT/, "Documento non riconosciuto: usa carta d'identità, patente o passaporto."],
  [/SIDES_MISMATCH/, "Fronte e retro non erano dello stesso documento: rifai la verifica fotografando lo stesso documento."],
  [/MISMATCH_WITH_PROVIDED|NAME_DIFFERENT|DATA_MISMATCH_BETWEEN/, "Il documento non coincide con i dati fiscali: se c'è un errore correggilo scrivendoli come sul documento, poi rifai la verifica."],
  [/FACE_MATCH|FACE_SIMILARITY/, "Il selfie non somiglia abbastanza alla foto del documento: rifallo con il viso ben illuminato, senza occhiali né cappello."],
  [/LIVENESS|NO_FACE|MULTIPLE_FACES|FACE_ATTACK|CAPTURED_DOCUMENT/, "Il selfie non è riuscito: rifallo da solo, guardando la fotocamera, con il viso ben illuminato."],
  [/BLURRY|RESOLUTION|QUALITY_TOO_LOW/, "La foto del documento era sfocata: rifalla tenendo fermo il telefono."],
  [/TOO_DARK|TOO_BRIGHT/, "Troppa o poca luce sul documento: rifai la foto con una luce uniforme, senza riflessi."],
  [/NOT_FULLY_VISIBLE|OCCLUSION/, "Il documento non si vedeva per intero: inquadralo tutto, senza dita sopra."],
  [/NOT_DETECTED|VALIDATION_FAILED|INVALID_DATE|FORMAT_MISMATCH|NOT_SAME|DATA_INCONSISTENT|SIGNATURE_INVALID/, "Non siamo riusciti a leggere i dati del documento: rifai la foto più nitida, con buona luce e senza riflessi."],
];

export function diditReason(warnings: string[]): string | null {
  for (const [pattern, reason] of REASONS) if (warnings.some((code) => pattern.test(code))) return reason;
  return null;
}
