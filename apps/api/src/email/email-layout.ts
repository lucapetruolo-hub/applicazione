import { EMAIL_BRAND, emailLogoUrl, frontendUrl } from "./email-brand";

/**
 * Modello grafico unico di tutte le email (docs/CHANGELOG.md §185): logo e
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
  /**
   * Riquadro con i dati principali (categoria, data, importo...). Con `url`
   * il valore diventa un link (mappa, telefono, email: docs/CHANGELOG.md §234).
   * Con `long` l'etichetta va sopra e il testo sotto, non in grassetto e con
   * gli a capo (descrizione intera nel riepilogo della richiesta).
   */
  details?: EmailDetail[];
  /** Titolo piccolo in testa al riquadro dei dettagli ("La tua richiesta"). */
  detailsTitle?: string;
  /** Miniature in fondo al riquadro dei dettagli (foto della richiesta), ognuna apre l'originale. */
  detailImages?: { label: string; images: { src: string; href: string }[] };
  /** Avviso urgente o scadenza: titolo e riquadro in rosso. */
  tone?: "default" | "urgent";
  /**
   * Codice da copiare (conferma email, docs/CHANGELOG.md §243): grande, a
   * cifre distanziate, prima del pulsante.
   */
  code?: { label: string; value: string };
  cta?: { label: string; url: string };
  /** Link semplice sotto il pulsante, per una seconda azione meno importante. */
  secondaryLink?: { label: string; url: string };
  /** Testo dopo il pulsante, più piccolo (scadenze del link, "se non sei stato tu"...). */
  after?: string[];
  /**
   * Perché arriva l'email: "notification" aggiunge il link alle preferenze di
   * notifica (si possono spegnere), "account" dice che è un messaggio di
   * servizio che arriva sempre, "external" è per chi non è iscritto (il
   * commercialista di un professionista, docs/CHANGELOG.md §374).
   */
  kind: "notification" | "account" | "external";
};

const EXTERNAL_FOOTER = "Ricevi questa email perché un professionista iscritto ha indicato il tuo indirizzo.";

export type EmailDetail = { label: string; value: string; url?: string; long?: boolean };

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

  const detailRow = (d: EmailDetail) => {
    const value = d.url ? `<a href="${escapeHtml(d.url)}" style="color:${c.text};">${escapeHtml(d.value)}</a>` : escapeHtml(d.value);
    return d.long
      ? `<p style="margin:10px 0 4px;font-family:${FONT};font-size:14px;line-height:1.45;color:${c.muted};">${escapeHtml(d.label)}</p>` +
          `<p style="margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:1.5;color:${c.text};">${value.replace(/\n/g, "<br>")}</p>`
      : `<p style="margin:4px 0;font-family:${FONT};font-size:15px;line-height:1.45;color:${c.text};"><span style="color:${c.muted};">${escapeHtml(d.label)}:</span> <strong>${value}</strong></p>`;
  };
  const imagesHtml = content.detailImages?.images.length
    ? `<p style="margin:10px 0 8px;font-family:${FONT};font-size:14px;line-height:1.45;color:${c.muted};">${escapeHtml(content.detailImages.label)}</p>` +
      `<p style="margin:0;font-size:0;line-height:0;">` +
      content.detailImages.images
        .map(
          (image) =>
            `<a href="${escapeHtml(image.href)}" style="display:inline-block;margin:0 8px 8px 0;text-decoration:none;">` +
            `<img src="${escapeHtml(image.src)}" width="88" height="88" alt="Foto" style="display:block;width:88px;height:88px;border:0;border-radius:10px;object-fit:cover;background:${c.card};"></a>`,
        )
        .join("") +
      `</p>`
    : "";
  const detailsHtml =
    content.details?.length || imagesHtml
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${urgent ? c.urgentTint : c.primaryTint};border-radius:14px;">` +
        `<tr><td style="padding:14px 18px;">` +
        (content.detailsTitle
          ? `<p style="margin:2px 0 8px;font-family:${FONT};font-size:16px;line-height:1.4;font-weight:800;color:${c.text};">${escapeHtml(content.detailsTitle)}</p>`
          : "") +
        (content.details ?? []).map(detailRow).join("") +
        imagesHtml +
        `</td></tr></table>`
      : "";

  const codeHtml = content.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${c.primaryTint};border-radius:14px;">` +
      `<tr><td align="center" style="padding:16px 18px;">` +
      `<p style="margin:0 0 6px;font-family:${FONT};font-size:14px;color:${c.muted};">${escapeHtml(content.code.label)}</p>` +
      `<p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;line-height:1.2;font-weight:800;letter-spacing:8px;color:${c.text};">${escapeHtml(content.code.value)}</p>` +
      `</td></tr></table>`
    : "";

  const ctaHtml = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:999px;background:${c.primary};">` +
      `<a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(content.cta.label)}</a>` +
      `</td></tr></table>` +
      (content.secondaryLink
        ? `<p style="margin:-12px 0 24px;font-family:${FONT};font-size:15px;line-height:1.5;"><a href="${escapeHtml(content.secondaryLink.url)}" style="color:${c.primaryDark};font-weight:700;">${escapeHtml(content.secondaryLink.label)}</a></p>`
        : "")
    : "";

  const footerReason =
    content.kind === "notification"
      ? `Ricevi questa email per le notifiche del tuo account. Puoi scegliere quali ricevere dalle <a href="${site}/account/notifiche" style="color:${c.muted};">preferenze di notifica</a>.`
      : content.kind === "external"
        ? EXTERNAL_FOOTER
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
    codeHtml +
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
    ...(content.details?.length || content.detailImages?.images.length
      ? [
          [
            ...(content.detailsTitle ? [content.detailsTitle] : []),
            ...(content.details ?? []).map((d) => `${d.label}: ${d.value}${d.url && !/^(tel|mailto):/.test(d.url) ? ` (${d.url})` : ""}`),
            ...(content.detailImages?.images.length ? [`${content.detailImages.label}: ${content.detailImages.images.length}`] : []),
          ].join("\n"),
        ]
      : []),
    ...(content.code ? [`${content.code.label}: ${content.code.value}`] : []),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`] : []),
    ...(content.secondaryLink ? [`${content.secondaryLink.label}: ${content.secondaryLink.url}`] : []),
    ...(content.after ?? []).map(plain),
    EMAIL_BRAND.signature,
    "—",
    content.kind === "notification"
      ? `Ricevi questa email per le notifiche del tuo account. Preferenze di notifica: ${site}/account/notifiche`
      : content.kind === "external"
        ? EXTERNAL_FOOTER
        : "Questa è un'email di servizio sul tuo account: arriva anche se hai spento le notifiche.",
    `Aiuto: ${EMAIL_BRAND.supportEmail}`,
  ];

  return { subject: content.subject, html, text: textParts.join("\n\n") };
}
