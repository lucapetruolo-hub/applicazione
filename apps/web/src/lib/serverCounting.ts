import { cookies, headers } from "next/headers";
import { NO_COUNT_COOKIE, isBotUserAgent } from "@professionisti/shared";

/**
 * Se una pagina fatta dal server deve contare la ricerca (docs/CHANGELOG.md
 * §372): no per i robot (Google, anteprime dei link) e per chi ha scelto
 * "Non contare questo browser" (admin e chi prova il sito).
 */
export async function shouldCountVisit(): Promise<boolean> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  if (isBotUserAgent(headerList.get("user-agent"))) return false;
  return cookieStore.get(NO_COUNT_COOKIE)?.value !== "1";
}
