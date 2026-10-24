// API finta per il controllo SEO in CI (docs/CHANGELOG.md §295): tre
// idraulici veri a Latina, nessun professionista nelle altre categorie.
// Così si provano sia le pagine piene (indicizzabili) sia quelle vuote
// (noindex). Risponde a tutto il resto con un elenco vuoto, così una pagina
// che chiede altro non si rompe.
import { createServer } from "node:http";
import { PROFESSIONALS, detail, prices } from "./fixture-data.mjs";

const PORT = Number(process.env.FIXTURE_API_PORT ?? 3001);
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/professionals/search") {
    const category = url.searchParams.get("category");
    const city = url.searchParams.get("city");
    const match = (!category || category === "idraulico") && (!city || city.toLowerCase() === "latina");
    return send(res, 200, match ? PROFESSIONALS : []);
  }
  const priceMatch = /^\/professionals\/prices\/([^/]+)$/.exec(url.pathname);
  if (priceMatch) return send(res, 200, prices(priceMatch[1]));
  const profile = /^\/professionals\/([^/]+)$/.exec(url.pathname);
  if (profile && req.method === "GET") {
    const pro = PROFESSIONALS.find((p) => p.id === profile[1]);
    return pro ? send(res, 200, detail(pro)) : send(res, 404, { message: "Not Found", statusCode: 404 });
  }
  if (url.pathname === "/stats/platform") {
    return send(res, 200, { totalUsers: 10, totalProfessionals: 3, reviewCount: 9, averageRating: 4.8 });
  }
  if (req.method !== "GET") return send(res, 204, {});
  return send(res, 200, []);
}).listen(PORT, "127.0.0.1", () => console.log(`API finta su http://127.0.0.1:${PORT}`));
