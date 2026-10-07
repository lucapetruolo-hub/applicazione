import { EMAIL_BRAND, emailLogoUrl, frontendUrl } from "./email-brand";

/**
 * Modello grafico unico di tutte le email (docs/CHANGELOG.md §183): logo e
 * nome in testa, titolo, testo, riquadro dei dettagli, un solo pulsante,
 * firma e piè di pagina. HTML a tabelle con stili in linea (l'unico che
 * Gmail, Outlook e Apple Mail mostrano allo stesso modo) più la versione in
 * solo testo, che migliora la consegna e serve a chi non apre l'HTML.
 *
 * I testi arrivano sempre come testo semplice e vengono "escapati" qui:
 * l'unica formattazione ammessa è `**grassetto**`.
 */
export type EmailContent = {
  subject: string;
  /** Riga di anteprima mostrata dalla casella accanto all'oggetto. Di default il primo paragrafo. */
  preheader?: string;
  /** Nome per il saluto: "Ciao Mario," — `null` per "Ciao,", assente per nessun saluto. */
  greeting?: string | null;
  title: string;
  paragraphs: string[];
  /** Riquadro con i dati principali (categoria, data, importo...). */
  details?: { label: string; value: string }[];
  /** Avviso urgente o scadenza: titolo e riquadro in rosso. */
  tone?: "default" | "urgent";
  cta?: { label: string; url: string };
  /** Testo dopo il pulsante, più piccolo (scadenze del link, "se non sei stato tu"...). */
  after?: string[];
  /**
   * Perché arriva l'email: "notification" aggiunge il link alle preferenze di
   * notifica (si possono spegnere), "account" dice che è un messaggio di
   * servizio che arriva sempre.
   */
  kind: "notification" | "account";
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Testo semplice → HTML sicuro, con `**grassetto**` e a capo. */
function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function plain(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, "$1");
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function renderEmail(content: EmailContent): RenderedEmail {
  const c = EMAIL_BRAND.colors;
  const urgent = content.tone === "urgent";
  const site = frontendUrl();
  const preheader = plain(content.preheader ?? content.paragraphs[0] ?? content.title);
  const greeting = content.greeting === undefined ? null : content.greeting ? `Ciao ${content.greeting},` : "Ciao,";

  const p = (text: string, size = 16, color: string = c.text) =>
    `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.55;color:${color};">${inline(text)}</p>`;

  const detailsHtml = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${urgent ? c.urgentTint : c.primaryTint};border-radius:14px;">` +
      `<tr><td style="padding:14px 18px;">` +
      content.details
        .map(
          (d) =>
            `<p style="margin:4px 0;font-family:${FONT};font-size:15px;line-height:1.45;color:${c.text};"><span style="color:${c.muted};">${escapeHtml(d.label)}:</span> <strong>${escapeHtml(d.value)}</strong></p>`,
        )
        .join("") +
      `</td></tr></table>`
    : "";

  const ctaHtml = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${c.primary};">` +
      `<a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(content.cta.label)}</a>` +
      `</td></tr></table>`
    : "";

  const footerReason =
    content.kind === "notification"
      ? `Ricevi questa email per le notifiche del tuo account. Puoi scegliere quali ricevere dalle <a href="${site}/account/notifiche" style="color:${c.muted};">preferenze di notifica</a>.`
      : "Questa è un'email di servizio sul tuo account: arriva anche se hai spento le notifiche.";

  const html =
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${c.background};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">` +
    // Testata: logo e nome.
    `<tr><td style="padding:0 8px 16px;"><a href="${site}" style="text-decoration:none;">` +
    `<img src="${escapeHtml(emailLogoUrl())}" width="36" height="36" alt="" style="vertical-align:middle;border:0;border-radius:10px;">` +
    `<span style="vertical-align:middle;margin-left:10px;font-family:${FONT};font-size:20px;font-weight:800;color:${c.text};">${escapeHtml(EMAIL_BRAND.name)}</span>` +
    `</a></td></tr>` +
    // Corpo.
    `<tr><td style="background:${c.card};border-radius:24px;padding:32px 28px;">` +
    `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;color:${urgent ? c.urgent : c.text};">${inline(content.title)}</h1>` +
    (greeting ? p(greeting) : "") +
    content.paragraphs.map((text) => p(text)).join("") +
    detailsHtml +
    ctaHtml +
    (content.after ?? []).map((text) => p(text, 14, c.muted)).join("") +
    p(EMAIL_BRAND.signature, 15, c.muted).replace("margin:0 0 16px", "margin:8px 0 0") +
    `</td></tr>` +
    // Piè di pagina.
    `<tr><td style="padding:18px 16px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${c.muted};text-align:center;">` +
    `${footerReason}<br>Hai bisogno di aiuto? Scrivi a <a href="mailto:${EMAIL_BRAND.supportEmail}" style="color:${c.muted};">${EMAIL_BRAND.supportEmail}</a>.` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const textParts = [
    plain(content.title),
    ...(greeting ? [greeting] : []),
    ...content.paragraphs.map(plain),
    ...(content.details?.length ? [content.details.map((d) => `${d.label}: ${d.value}`).join("\n")] : []),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`] : []),
    ...(content.after ?? []).map(plain),
    EMAIL_BRAND.signature,
    "—",
    content.kind === "notification"
      ? `Ricevi questa email per le notifiche del tuo account. Preferenze di notifica: ${site}/account/notifiche`
      : "Questa è un'email di servizio sul tuo account: arriva anche se hai spento le notifiche.",
    `Aiuto: ${EMAIL_BRAND.supportEmail}`,
  ];

  return { subject: content.subject, html, text: textParts.join("\n\n") };
}
