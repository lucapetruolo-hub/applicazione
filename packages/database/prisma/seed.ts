// Seed di sviluppo: popola categorie e professionisti demo così che ricerca
// e homepage abbiano dati reali (dal DB, non hardcoded) fin dal day 1.
// CLAUDE.md §5.3: le entità di dominio vivono prima nello schema, qui le
// istanziamo per l'ambiente di sviluppo/demo.
import { PROFESSIONAL_CATEGORIES, PLACEHOLDER_PROFESSIONALS } from "@professionisti/shared";
import { prisma } from "../src/index";

// Coordinate approssimate dei capoluoghi usati nei profili demo. Quando i
// professionisti reali si registreranno inseriranno il proprio indirizzo e
// queste verranno geocodificate: per l'MVP la ricerca filtra per città come
// stringa, la lat/lng serve solo a preparare il terreno per il raggio PostGIS
// (fase 2, vedi CLAUDE.md §2).
const CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  Latina: { latitude: 41.4677, longitude: 12.9036 },
  Roma: { latitude: 41.9028, longitude: 12.4964 },
  Napoli: { latitude: 40.8518, longitude: 14.2681 },
  Milano: { latitude: 45.4642, longitude: 9.19 },
  Torino: { latitude: 45.0703, longitude: 7.6869 },
  Bologna: { latitude: 44.4949, longitude: 11.3426 },
  Firenze: { latitude: 43.7696, longitude: 11.2558 },
  Genova: { latitude: 44.4056, longitude: 8.9463 },
  Bari: { latitude: 41.1171, longitude: 16.8719 },
  Verona: { latitude: 45.4384, longitude: 10.9916 },
};

async function main() {
  console.log("Seeding categorie...");
  const categoriesBySlug = new Map<string, { id: string }>();
  for (const category of PROFESSIONAL_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { label: category.label, subTags: [...category.subTags] },
      create: { slug: category.slug, label: category.label, subTags: [...category.subTags] },
    });
    categoriesBySlug.set(category.slug, row);
  }

  console.log("Seeding professionisti demo...");
  for (const pro of PLACEHOLDER_PROFESSIONALS) {
    const category = categoriesBySlug.get(pro.categorySlug);
    if (!category) continue;

    const coords = CITY_COORDINATES[pro.city] ?? CITY_COORDINATES.Roma;
    const email = `${slugify(pro.businessName)}@demo.professionisti.it`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "PROFESSIONAL", name: pro.businessName },
    });

    const profile = await prisma.professionalProfile.upsert({
      where: { userId: user.id },
      update: {
        categoryId: category.id,
        businessName: pro.businessName,
        city: pro.city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        verified: pro.verified,
        isDemo: true,
      },
      create: {
        userId: user.id,
        categoryId: category.id,
        subTags: [],
        businessName: pro.businessName,
        city: pro.city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        verified: pro.verified,
        isDemo: true,
      },
    });

    await seedDemoReviews(profile.id, user.id, pro.businessName, pro.rating);
  }

  console.log(`Seed completato: ${categoriesBySlug.size} categorie, ${PLACEHOLDER_PROFESSIONALS.length} professionisti demo.`);
}

const DEMO_CLIENT_EMAILS = [
  "cliente-demo-1@demo.professionisti.it",
  "cliente-demo-2@demo.professionisti.it",
  "cliente-demo-3@demo.professionisti.it",
  "cliente-demo-4@demo.professionisti.it",
  "cliente-demo-5@demo.professionisti.it",
];

const DEMO_REVIEW_COMMENTS = [
  "Lavoro svolto in modo professionale, puntuale e disponibile.",
  "Preventivo chiaro, nessuna sorpresa sul prezzo finale.",
  "Consigliato, ha risolto il problema velocemente.",
  "Ottima comunicazione durante tutto il lavoro.",
  "Prezzo onesto e risultato di qualità.",
];

/**
 * Crea booking COMPLETED + review per un professionista demo così che il
 * rating mostrato in ricerca sia calcolato da recensioni reali (nessun campo
 * "rating" hardcoded sul profilo), non un numero fabbricato.
 */
async function seedDemoReviews(professionalProfileId: string, professionalUserId: string, businessName: string, targetAverage: number) {
  const ratings = ratingsForAverage(targetAverage, DEMO_CLIENT_EMAILS.length);

  for (let i = 0; i < DEMO_CLIENT_EMAILS.length; i++) {
    const email = DEMO_CLIENT_EMAILS[i];
    const client = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "CLIENT", name: `Cliente Demo ${i + 1}` },
    });

    const existingBooking = await prisma.booking.findFirst({
      where: { clientId: client.id, professionalProfileId },
    });
    if (existingBooking) continue;

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() - (i + 1) * 14);

    const booking = await prisma.booking.create({
      data: {
        clientId: client.id,
        professionalProfileId,
        scheduledAt,
        status: "COMPLETED",
      },
    });

    await prisma.review.create({
      data: {
        bookingId: booking.id,
        rating: ratings[i],
        comment: DEMO_REVIEW_COMMENTS[i % DEMO_REVIEW_COMMENTS.length],
      },
    });
  }

  console.log(`  - ${businessName}: ${ratings.length} recensioni demo (media target ${targetAverage})`);
}

/** Distribuisce `count` voti interi (1-5) la cui media è il più vicino possibile a `target`. */
function ratingsForAverage(target: number, count: number): number[] {
  const total = Math.round(target * count);
  const base = Math.max(1, Math.min(5, Math.floor(total / count)));
  const remainder = total - base * count;
  const ratings = Array<number>(count).fill(base);
  for (let i = 0; i < remainder && i < count; i++) {
    ratings[i] = Math.min(5, ratings[i] + 1);
  }
  return ratings;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
