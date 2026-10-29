import { createHmac, timingSafeEqual } from "node:crypto";
import {
  WhatsAppProviderError,
  type WhatsAppInbound,
  type WhatsAppProvider,
  type WhatsAppStatusUpdate,
  type WhatsAppTemplateMessage,
} from "./whatsapp-provider";

const TIMEOUT_MS = 10_000;

/**
 * Errori di Meta per cui riprovare non serve: numero senza WhatsApp o non
 * raggiungibile (131026), modello inesistente, in pausa o con parametri
 * sbagliati (132xxx), utente che ha bloccato i messaggi dell'azienda
 * (131050), account bloccato (131031), numero non valido (131009/100).
 * Gli altri (limiti, 5xx, rete) si riprovano al giro successivo.
 */
function isPermanent(code: string | null): boolean {
  if (!code) return false;
  return (
    code === "131026" ||
    code === "131050" ||
    code === "131031" ||
    code === "131009" ||
    code === "100" ||
    code.startsWith("132")
  );
}

/**
 * Meta diretto, WhatsApp Cloud API (graph.facebook.com). Chiavi su Render:
 * `WHATSAPP_ACCESS_TOKEN` (token di sistema permanente del Business
 * Manager), `WHATSAPP_PHONE_NUMBER_ID` (il numero aziendale),
 * `WHATSAPP_APP_SECRET` (firma del webhook) e `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
 * (scelto da noi, per la registrazione del webhook).
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";

  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly appSecret: string | null,
    private readonly graphVersion = "v23.0",
  ) {}

  async sendTemplate(
    message: WhatsAppTemplateMessage,
  ): Promise<{ providerMessageId: string }> {
    const components: Record<string, unknown>[] = [];
    const bodyParams = message.copyCode
      ? [message.copyCode]
      : message.bodyParams;
    if (bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: bodyParams.map((text) => ({ type: "text", text })),
      });
    }
    if (message.copyCode) {
      // Modelli di autenticazione: il pulsante "Copia codice" riceve lo stesso codice.
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: message.copyCode }],
      });
    } else if (message.urlButtonSuffix) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(message.urlButtonIndex ?? 0),
        parameters: [{ type: "text", text: message.urlButtonSuffix }],
      });
    }
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: "template",
      template: {
        name: message.template,
        language: { code: message.language },
        components,
      },
    });
  }

  async sendText(message: {
    to: string;
    body: string;
  }): Promise<{ providerMessageId: string }> {
    return this.post({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.to,
      type: "text",
      text: { body: message.body, preview_url: false },
    });
  }

  private async post(
    payload: Record<string, unknown>,
  ): Promise<{ providerMessageId: string }> {
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(this.phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (error) {
      throw new WhatsAppProviderError(
        `Meta non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!response.ok) {
      const error = (body?.error ?? {}) as Record<string, unknown>;
      const code = error.code != null ? String(error.code) : null;
      const detail =
        typeof error.message === "string"
          ? error.message
          : `risposta ${response.status}`;
      throw new WhatsAppProviderError(
        `Meta: ${detail}`,
        code,
        isPermanent(code),
      );
    }
    const messages = Array.isArray(body?.messages)
      ? (body.messages as Record<string, unknown>[])
      : [];
    const id = messages[0]?.id;
    if (typeof id !== "string")
      throw new WhatsAppProviderError("Meta: risposta senza id del messaggio.");
    return { providerMessageId: id };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    return verifyMetaSignature(
      rawBody,
      headers["x-hub-signature-256"],
      this.appSecret,
    );
  }

  parseWebhook(body: unknown): {
    statuses: WhatsAppStatusUpdate[];
    inbound: WhatsAppInbound[];
  } {
    return parseMetaWebhook(body);
  }
}

/** Firma `X-Hub-Signature-256: sha256=<hmac>` del corpo con l'App Secret. Senza segreto: rifiutato. */
export function verifyMetaSignature(
  rawBody: Buffer,
  header: string | string[] | undefined,
  appSecret: string | null,
): boolean {
  if (!appSecret || !Buffer.isBuffer(rawBody)) return false;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const given = value.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(
    Buffer.from(given, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Stati dei messaggi e messaggi in arrivo dal webhook di Meta (`entry[].changes[].value`). */
export function parseMetaWebhook(body: unknown): {
  statuses: WhatsAppStatusUpdate[];
  inbound: WhatsAppInbound[];
} {
  const statuses: WhatsAppStatusUpdate[] = [];
  const inbound: WhatsAppInbound[] = [];
  for (const entry of list(record(body)?.entry)) {
    for (const change of list(record(entry)?.changes)) {
      const value = record(record(change)?.value);
      if (!value) continue;
      for (const raw of list(value.statuses)) {
        const s = record(raw);
        const status = s?.status;
        if (
          !s ||
          typeof s.id !== "string" ||
          (status !== "sent" &&
            status !== "delivered" &&
            status !== "read" &&
            status !== "failed")
        )
          continue;
        const seconds = Number(s.timestamp);
        const pricing = record(s.pricing);
        const error = record(list(s.errors)[0]);
        statuses.push({
          providerMessageId: s.id,
          status,
          at:
            Number.isFinite(seconds) && seconds > 0
              ? new Date(seconds * 1000)
              : new Date(),
          billable:
            typeof pricing?.billable === "boolean" ? pricing.billable : null,
          category:
            typeof pricing?.category === "string" ? pricing.category : null,
          errorCode: error?.code != null ? String(error.code) : null,
          errorMessage:
            typeof error?.title === "string"
              ? error.title
              : typeof error?.message === "string"
                ? error.message
                : null,
        });
      }
      for (const raw of list(value.messages)) {
        const m = record(raw);
        if (!m || typeof m.from !== "string") continue;
        const text = record(m.text)?.body;
        const button = record(m.button);
        const interactive = record(record(m.interactive)?.button_reply);
        inbound.push({
          from: m.from.replace(/\D/g, ""),
          text:
            typeof text === "string"
              ? text
              : typeof button?.text === "string"
                ? button.text
                : null,
          buttonPayload:
            typeof button?.payload === "string"
              ? button.payload
              : typeof interactive?.id === "string"
                ? interactive.id
                : null,
          replyTo:
            typeof record(m.context)?.id === "string"
              ? (record(m.context)!.id as string)
              : null,
        });
      }
    }
  }
  return { statuses, inbound };
}
