import { NextResponse, type NextRequest } from "next/server";

/**
 * Ingresso nascosto all'area admin (controllo sicurezza, docs/CHANGELOG.md
 * §290, richiesta di Luca: "/admin" era troppo facile da trovare). Con
 * `ADMIN_ENTRY_PATH` impostata su Vercel (solo lato server, mai nel codice
 * del browser) "/admin" risponde "pagina non trovata" finché da quel browser
 * non si apre una volta il link segreto `/<ADMIN_ENTRY_PATH>`, che lascia un
 * cookie e porta all'area admin. Non sostituisce i controlli veri: ogni dato
 * admin lo dà solo l'API, a chi ha un account admin. Senza la variabile
 * tutto resta come prima.
 */
const GATE_COOKIE = "admin_gate";
const GATE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

async function gateValue(entryPath: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`admin-gate:${entryPath}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const entryPath = process.env.ADMIN_ENTRY_PATH?.trim().replace(/^\/+|\/+$/g, "");
  if (!entryPath) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === `/${entryPath}`) {
    const response = NextResponse.redirect(new URL("/admin", request.url));
    response.cookies.set(GATE_COOKIE, await gateValue(entryPath), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/admin",
      maxAge: GATE_MAX_AGE_SECONDS,
    });
    return response;
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (request.cookies.get(GATE_COOKIE)?.value !== (await gateValue(entryPath))) {
      // Percorso che non esiste: Next mostra la sua pagina "non trovata" con stato 404.
      return NextResponse.rewrite(new URL("/pagina-non-trovata", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  // Tutte le pagine (il link d'ingresso può avere qualunque nome), non i file statici.
  matcher: ["/((?!_next/|favicon|.*\\..*).*)"],
};
