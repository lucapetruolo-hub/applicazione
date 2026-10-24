// Dati dell'API finta del controllo SEO (docs/CHANGELOG.md §295), letti sia
// dal server (fixture-api.mjs) sia dal controllo (check.mjs).
const today = new Date().toISOString().slice(0, 10);

function professional(n, businessName) {
  return {
    id: `1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4be${n}`,
    businessName,
    categorySlug: "idraulico",
    categoryLabel: "Idraulico",
    categories: [{ slug: "idraulico", label: "Idraulico" }],
    city: "Latina",
    address: null,
    verified: true,
    stripeVerified: false,
    rating: 4.8,
    reviewCount: 3,
    boosted: false,
    remoteAvailable: false,
    latitude: 41.4676,
    longitude: 12.9037,
    imageUrl: null,
    services: [],
    subTags: [],
    spokenLanguages: ["Italiano"],
    hasLiabilityInsurance: false,
    availabilityPreview: [],
    availabilityFrom: today,
    createdAt: "2026-09-01T10:00:00.000Z",
    completedThisMonth: 0,
    isNewProfile: false,
  };
}

export const PROFESSIONALS = [
  professional(1, "Idraulica Rossi"),
  professional(2, "Bianchi Impianti"),
  professional(3, "Verdi Termoidraulica"),
];

export function detail(pro) {
  return {
    ...pro,
    traderStatus: "TRADER",
    bio: "Impianti idraulici e riparazioni a Latina e dintorni.",
    reviews: [{ id: "r1", rating: 5, comment: "Puntuale e preciso.", photoUrls: [], createdAt: "2026-10-01T10:00:00.000Z" }],
    portfolioUrls: [],
    completedJobsTotal: 3,
    avgResponseTimeMinutes: 30,
    yearsOfExperience: 10,
    certifications: null,
    acceptingRequests: true,
  };
}

/** Prezzi veri solo per gli idraulici: le altre categorie restano sotto soglia. */
export function prices(categorySlug) {
  if (categorySlug !== "idraulico") return { categorySlug, quotes: null, declared: null };
  return {
    categorySlug,
    quotes: { count: 12, lowEurCents: 8000, medianEurCents: 12000, highEurCents: 18000, updatedAt: "2026-10-20T10:00:00.000Z" },
    declared: {
      professionalCount: 5,
      services: [{ name: "Sostituzione rubinetto", professionalCount: 4, minEurCents: 5000, maxEurCents: 9000 }],
    },
  };
}
