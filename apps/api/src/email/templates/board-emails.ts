import { frontendUrl } from "../email-brand";
import { renderEmail, type RenderedEmail } from "../email-layout";

/**
 * "Avvisami alla prima richiesta" della bacheca "Lavori cercati"
 * (docs/changelog/2026-11-17-bacheca-rispondi.md): parte una volta sola,
 * poi l'indirizzo si cancella. Nessun dato del cliente, solo il link alla
 * pagina pubblica.
 */
export function boardAlertEmail(input: { tradeLabel: string; provinceName: string; path: string }): RenderedEmail {
  const trade = input.tradeLabel.toLowerCase();
  return renderEmail({
    kind: "external",
    externalReason: `Ricevi questa email perché hai chiesto di essere avvisato della prima richiesta per ${trade} in provincia di ${input.provinceName}. È l'unica: il tuo indirizzo è già stato cancellato.`,
    subject: `Un cliente in provincia di ${input.provinceName} cerca: ${trade}`,
    preheader: "Guarda la richiesta e decidi se rispondere.",
    title: "C'è una richiesta per te",
    paragraphs: [
      `In provincia di ${input.provinceName} un cliente aspetta un preventivo per un lavoro da ${trade}.`,
      "Per rispondere crea il tuo profilo: il prezzo lo decidi tu.",
    ],
    cta: { label: "Guarda la richiesta", url: `${frontendUrl()}${input.path}` },
  });
}
