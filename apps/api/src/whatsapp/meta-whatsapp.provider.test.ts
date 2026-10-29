import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MetaWhatsAppProvider,
  parseMetaWebhook,
  verifyMetaSignature,
} from "./meta-whatsapp.provider";
import { WhatsAppProviderError } from "./whatsapp-provider";
import {
  CLIENT_REMINDER_TEMPLATES,
  WHATSAPP_FOOTER,
  WHATSAPP_REPLY_FOOTER,
  urlButtonIndex,
  WHATSAPP_STOP_BUTTON,
  PROFESSIONAL_DAY_TEMPLATES,
  WHATSAPP_TEMPLATES,
} from "./whatsapp-templates";

const sign = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(Buffer.from(body)).digest("hex")}`;

describe("firma del webhook di Meta", () => {
  const body = JSON.stringify({ entry: [] });

  it("accetta solo la firma fatta con l'App Secret", () => {
    expect(
      verifyMetaSignature(Buffer.from(body), sign(body, "segreto"), "segreto"),
    ).toBe(true);
    expect(
      verifyMetaSignature(Buffer.from(body), sign(body, "altro"), "segreto"),
    ).toBe(false);
    expect(
      verifyMetaSignature(
        Buffer.from(`${body} `),
        sign(body, "segreto"),
        "segreto",
      ),
    ).toBe(false);
  });

  it("senza segreto o senza firma rifiuta", () => {
    expect(
      verifyMetaSignature(Buffer.from(body), sign(body, "segreto"), null),
    ).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), undefined, "segreto")).toBe(
      false,
    );
    expect(
      verifyMetaSignature(Buffer.from(body), "sha256=corta", "segreto"),
    ).toBe(false);
  });
});

describe("lettura del webhook", () => {
  it("stati con costo ed errori, e risposte con il pulsante", () => {
    const parsed = parseMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.1",
                    status: "delivered",
                    timestamp: "1800000000",
                    pricing: { billable: true, category: "utility" },
                  },
                  {
                    id: "wamid.2",
                    status: "failed",
                    timestamp: "1800000001",
                    errors: [{ code: 131026, title: "Message undeliverable" }],
                  },
                  { id: "wamid.3", status: "deleted" },
                ],
                messages: [
                  {
                    from: "393331234567",
                    type: "button",
                    button: {
                      text: "Non ricevere più",
                      payload: "Non ricevere più",
                    },
                  },
                  {
                    from: "393331234567",
                    type: "button",
                    context: { from: "390000000000", id: "wamid.1" },
                    button: { text: "Ci sarò", payload: "Ci sarò" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(parsed.statuses).toHaveLength(2);
    expect(parsed.statuses[0]).toMatchObject({
      providerMessageId: "wamid.1",
      status: "delivered",
      billable: true,
      category: "utility",
    });
    expect(parsed.statuses[1]).toMatchObject({
      status: "failed",
      errorCode: "131026",
      errorMessage: "Message undeliverable",
    });
    expect(parsed.inbound).toEqual([
      {
        from: "393331234567",
        text: "Non ricevere più",
        buttonPayload: "Non ricevere più",
        replyTo: null,
      },
      {
        from: "393331234567",
        text: "Ci sarò",
        buttonPayload: "Ci sarò",
        replyTo: "wamid.1",
      },
    ]);
  });

  it("un corpo strano non fa cadere nulla", () => {
    expect(parseMetaWebhook(null)).toEqual({ statuses: [], inbound: [] });
    expect(parseMetaWebhook({ entry: "x" })).toEqual({
      statuses: [],
      inbound: [],
    });
  });
});

describe("invio con la Cloud API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda il modello con parametri e parte del link del pulsante", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.9" }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MetaWhatsAppProvider("token", "12345", "segreto");
    const result = await provider.sendTemplate({
      to: "393331234567",
      template: "promemoria_appuntamento_cliente",
      language: "it",
      bodyParams: ["giovedì", "Rossi"],
      urlButtonSuffix: "le-mie-richieste?open=r1",
    });
    expect(result.providerMessageId).toBe("wamid.9");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/12345/messages");
    const sent = JSON.parse(init.body as string);
    expect(sent.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "giovedì" },
          { type: "text", text: "Rossi" },
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "le-mie-richieste?open=r1" }],
      },
    ]);
  });

  it("numero senza WhatsApp: errore da non riprovare", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: { code: 131026, message: "Undeliverable" },
            }),
            { status: 400 },
          ),
        ),
    );
    const provider = new MetaWhatsAppProvider("token", "12345", null);
    const error = await provider
      .sendTemplate({
        to: "39333",
        template: "x",
        language: "it",
        bodyParams: [],
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhatsAppProviderError);
    expect((error as WhatsAppProviderError).permanent).toBe(true);
  });

  it("limite di Meta: si riprova", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { code: 130429 } }), {
            status: 429,
          }),
        ),
    );
    const provider = new MetaWhatsAppProvider("token", "12345", null);
    const error = (await provider
      .sendTemplate({
        to: "39333",
        template: "x",
        language: "it",
        bodyParams: [],
      })
      .catch((e: unknown) => e)) as WhatsAppProviderError;
    expect(error.permanent).toBe(false);
  });
});

describe("risposta in testo libero", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda un testo semplice, senza anteprima dei link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.t" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new MetaWhatsAppProvider("tok", "123", "s").sendText({
      to: "393331234567",
      body: "Grazie!",
    });
    expect(result).toEqual({ providerMessageId: "wamid.t" });
    const init = fetchMock.mock.calls[0]![1] as { body: string };
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "393331234567",
      type: "text",
      text: { body: "Grazie!", preview_url: false },
    });
  });
});

describe("risposta con il pulsante 'Ho sbagliato'", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("diventa un messaggio con un pulsante di risposta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.b" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await new MetaWhatsAppProvider("tok", "123", "s").sendText({
      to: "393331234567",
      body: "Grazie!",
      buttons: [{ id: "UNDO", title: "Ho sbagliato" }],
    });
    const init = fetchMock.mock.calls[0]![1] as { body: string };
    expect(JSON.parse(init.body)).toMatchObject({
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Grazie!" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "UNDO", title: "Ho sbagliato" } },
          ],
        },
      },
    });
  });
});

describe("modelli da far approvare a Meta", () => {
  it("rispettano le regole di Meta", () => {
    expect(WHATSAPP_FOOTER.length).toBeLessThanOrEqual(60);
    expect(WHATSAPP_STOP_BUTTON.length).toBeLessThanOrEqual(25);
    expect(WHATSAPP_REPLY_FOOTER.length).toBeLessThanOrEqual(60);
    for (const template of [
      ...Object.values(WHATSAPP_TEMPLATES),
      ...Object.values(CLIENT_REMINDER_TEMPLATES),
      ...PROFESSIONAL_DAY_TEMPLATES,
    ]) {
      expect(template.name).toMatch(/^[a-z0-9_]{1,512}$/);
      expect(template.body.length).toBeLessThanOrEqual(1024);
      const variables = template.body.match(/\{\{\d+\}\}/g) ?? [];
      expect(template.example).toHaveLength(variables.length);
      if (template.urlButton)
        expect(template.urlButton.text.length).toBeLessThanOrEqual(25);
      for (const button of template.replyButtons ?? [])
        expect(button.length).toBeLessThanOrEqual(25);
      expect(urlButtonIndex(template)).toBe(
        template.replyButtons ? template.replyButtons.length + 1 : 0,
      );
      if (template.category === "authentication") continue;
      // Niente variabili all'inizio o alla fine del testo.
      expect(template.body).not.toMatch(/^\{\{/);
      expect(template.body).not.toMatch(/\}\}[.!?]?$/);
      expect(template.stopButton).toBe(true);
    }
  });
});
