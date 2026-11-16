// API finta per il controllo SEO in CI (docs/CHANGELOG.md §296): tre
// idraulici veri a Latina, nessun professionista nelle altre categorie.
// Così si provano sia le pagine piene (indicizzabili) sia quelle vuote
// (noindex). Risponde a tutto il resto con un elenco vuoto, così una pagina
// che chiede altro non si rompe.
import { createServer } from "node:http";
import { PROFESSIONALS, TEST_PROFESSIONAL, detail, prices } from "./fixture-data.mjs";

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
  // Elenchi leggeri usati da sitemap e home (docs/changelog/2026-11-16-traffico-elevato.md).
  if (url.pathname === "/professionals/directory") {
    return send(res, 200, PROFESSIONALS.map(({ id, businessName, city, categories, subTags, updatedAt }) => ({ id, businessName, city, categories, subTags, updatedAt })));
  }
  if (url.pathname === "/professionals/newest") {
    return send(res, 200, PROFESSIONALS.map(({ id, businessName, categorySlug, categoryLabel, city, createdAt, imageUrl, rating, verified }) => ({ id, businessName, categorySlug, categoryLabel, city, createdAt, imageUrl, rating, verified })));
  }
  if (url.pathname === "/professionals/category-counts") {
    const city = url.searchParams.get("city");
    const counts = !city || city.toLowerCase() === "latina" ? [{ slug: "idraulico", count: PROFESSIONALS.length }] : [];
    return send(res, 200, { scope: city ? "CITY" : "ALL", counts });
  }
  const priceMatch = /^\/professionals\/prices\/([^/]+)$/.exec(url.pathname);
  if (priceMatch) return send(res, 200, prices(priceMatch[1], url.searchParams.get("city")));
  const profile = /^\/professionals\/([^/]+)$/.exec(url.pathname);
  if (profile && req.method === "GET") {
    const pro = [...PROFESSIONALS, TEST_PROFESSIONAL].find((p) => p.id === profile[1]);
    return pro ? send(res, 200, detail(pro)) : send(res, 404, { message: "Not Found", statusCode: 404 });
  }
  if (url.pathname === "/stats/platform") {
    return send(res, 200, { totalUsers: 10, totalProfessionals: 3, reviewCount: 9, averageRating: 4.8 });
  }
  if (req.method !== "GET") return send(res, 204, {});
  return send(res, 200, []);
}).listen(PORT, "127.0.0.1", () => console.log(`API finta su http://127.0.0.1:${PORT}`));
