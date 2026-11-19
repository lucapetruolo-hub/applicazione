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

/**
 * Lavori cercati della settimana ("sì" di Luca del 18/11/2026,
 * docs/changelog/2026-11-18-bacheca-cliente.md): il lunedì, al professionista
 * visibile, le richieste nuove del suo mestiere entro 100 km che non gli sono
 * arrivate. Solo titolo, mestiere e luogo della scheda anonima.
 */
export function boardWeeklyEmail(input: { name: string | null; cards: { id: string; trade: string; title: string; place: string; tradeLabel: string }[]; total: number }) {
  const shown = input.cards.slice(0, 5);
  const more = input.total - shown.length;
  return {
    subject: input.total === 1 ? "1 lavoro cercato vicino a te" : `${input.total} lavori cercati vicino a te`,
    preheader: "Richieste nuove del tuo mestiere entro 100 km.",
    greeting: input.name,
    title: "Lavori cercati vicino a te",
    paragraphs: [
      input.total === 1
        ? "Questa settimana un cliente entro 100 km da te ha chiesto un preventivo per un lavoro che fai. La richiesta non ti era ancora arrivata."
        : `Questa settimana ${input.total} clienti entro 100 km da te hanno chiesto un preventivo per un lavoro che fai. Le richieste non ti erano ancora arrivate.`,
      "Tocca una richiesta per riceverla nel tuo elenco e mandare il preventivo. Il prezzo lo decidi tu.",
    ],
    detailsTitle: "Le richieste",
    details: shown.map((card) => ({ label: `${card.tradeLabel} · ${card.place}`, value: card.title, url: `${frontendUrl()}/rispondi?richiesta=${card.id}` })),
    ...(more > 0 ? { after: [more === 1 ? "C'è anche un'altra richiesta in Lavori cercati." : `Ci sono anche altre ${more} richieste in Lavori cercati.`] } : {}),
    // Si spegne e si riaccende nella pagina "Lavori cercati" del suo mestiere (decisione di Luca del 18/11,
    // docs/changelog/2026-11-18-email-settimana-in-bacheca.md).
    ...(shown[0] ? { secondaryLink: { label: "Spegni o riaccendi questa email", url: `${frontendUrl()}/lavora-con-noi/${shown[0].trade}#email-settimana` } } : {}),
    ...(shown[0] ? { cta: { label: "Apri Lavori cercati", url: `${frontendUrl()}/lavora-con-noi/${shown[0].trade}` } } : {}),
  };
}
