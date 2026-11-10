import { API_URL } from "@/lib/apiUrl";

/**
 * File .ics di "Altri calendari" (docs/changelog/2026-11-10-calendario-iphone.md):
 * il link firmato arriva dal pulsante della scheda o dalle email, l'API
 * controlla firma e scadenza e dà il file. Qui risponde `text/calendar` dal
 * nostro dominio: Safari su iPhone mostra da solo "Aggiungi al calendario",
 * Android e computer aprono o scaricano il file. Link scaduto o
 * appuntamento annullato: una pagina chiara invece di un errore tecnico.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const token = file.replace(/\.ics$/, "");
  let response: Response;
  try {
    response = await fetch(`${API_URL}/bookings/ics/${encodeURIComponent(token)}.ics`, { cache: "no-store" });
  } catch {
    response = new Response(null, { status: 503 });
  }
  if (!response.ok) {
    // Il destinatario è scritto nel link (`<id>.p.` per il professionista): solo per scegliere dove riportarlo.
    const pro = /^[0-9a-f-]{36}\.p\./i.test(token);
    const target = new URL("/calendario/scaduto", request.url);
    if (pro) target.searchParams.set("per", "professionista");
    if (response.status >= 500 || response.status === 429) target.searchParams.set("riprova", "1");
    return Response.redirect(target, 303);
  }
  return new Response(await response.text(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="appuntamento.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
