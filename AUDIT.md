# AUDIT — Fase 0 (redesign "Professionisti")

Eseguito prima di qualunque modifica, come richiesto dal brief. Contiene solo osservazioni verificate sul repository reale, nessuna assunzione.

---

## ⚠️ Disallineamenti critici tra il brief e lo stack reale

Il brief presuppone **Next.js App Router + Tailwind**. Lo stack reale è diverso su un punto strutturale che condiziona tutte le fasi successive:

| Il brief assume | Cosa c'è davvero |
|---|---|
| Tailwind (`tailwind.config.*`, `@layer base`, classi utility) | **Nessuna traccia di Tailwind nel repo** (`find . -iname "tailwind.config*"` → 0 risultati). Zero dipendenza `tailwindcss` in `apps/web/package.json`. |
| Design system CSS custom properties + componenti `components/ui/*.tsx` scritti da zero | Esiste già **un design system unico condiviso web+mobile**: `packages/ui` (Tamagui), con `createTamagui()` sulla **config di default** di `@tamagui/config` (`packages/ui/src/config.ts`) — **nessun token di brand personalizzato oggi**, solo la palette stock di Tamagui (`$blue10`, `$color3`, ecc. visti ovunque nel codice). |
| `lucide-react` (libreria DOM/SVG) | Il repo è un **monorepo con app mobile nativa** (`apps/mobile`, Expo/React Native) che **consuma gli stessi componenti** (`SearchBar`, `CategoryCard`, ecc. da `packages/ui`). `lucide-react` non funziona in React Native: servirebbe `lucide-react-native` (pacchetto diverso) per non rompere l'app mobile o duplicare i componenti. |
| `next/font/google` per Archivo/Inter Tight/IBM Plex Mono | Oggi **nessun font custom caricato**: `apps/web/src/app/globals.css` imposta solo `font-family: -apple-system, ...` di sistema. `layout.tsx` non importa `next/font`. |
| Server Actions (`useFormState`) per i form | **Zero Server Actions nel repo** (`grep '"use server"'` → 0 risultati). Tutti i form sono componenti client (`"use client"`) che chiamano `apps/api` (NestJS separato) via `packages/api-client`, con validazione **Zod condivisa** in `packages/shared/src/schemas.ts` (client e server, non client+Server Action). |
| Dati in Prisma/Supabase generici | **Prisma + PostgreSQL**, confermato — ma il backend è un **servizio NestJS separato** (`apps/api`, deploy su Railway), non route handler Next.js. Ogni pagina che oggi fa fetch dati usa `packages/api-client`, non query Prisma dirette da Next.js. |

**Perché conta:** `packages/ui` non è un dettaglio implementativo, è la garanzia esplicita in `CLAUDE.md` ("stessa interfaccia su iOS, Android e web desktop") che i due frontend non divergano. Introdurre Tailwind + `components/ui/*.tsx` locali a `apps/web` come propone il brief, in parallelo a Tamagui, significa:
- avere **due design system attivi contemporaneamente** nello stesso repo (rischio concreto di conflitti CSS/hydration, non solo di manutenzione doppia);
- **rompere la parità con l'app mobile** per ogni componente che il brief vuole "solo web" (Section, Card, Chip, Rating, ecc. sono概concettualmente cross-platform, oggi vivono in `packages/ui`).

La via architetturalmente coerente con quanto già approvato in `CLAUDE.md` è: **portare i nuovi token (colore, radius, spaziatura) dentro `createTamagui()`** in `packages/ui/src/config.ts` (estendendo/sostituendo `@tamagui/config`), e i nuovi componenti primitivi (`Section`, `Eyebrow`, `Card`, `Chip`, `Badge`, `Rating`, `Field`, `Avatar`, `EmptyState`) dentro `packages/ui`, non in un nuovo `apps/web/components/ui/`. Tipografia via `next/font` resta legittima ma va esposta come token condivisi (Tamagui supporta font custom nella config). Le icone Lucide vanno bene solo se: (a) si accetta che siano web-only e si duplica la resa icone lato mobile con `lucide-react-native`, oppure (b) si accetta uno strato di icone leggermente diverso tra web e mobile — è una decisione di prodotto, non tecnica, e va presa esplicitamente.

**Non ho modificato nulla in base a questa osservazione: aspetto conferma su come riconciliarla prima di procedere a qualunque fase successiva**, come da istruzione esplicita del brief.

---

## 1. Stack — package.json, next.config, tailwind.config, tsconfig

- **Monorepo**: Turborepo + pnpm workspaces (`.npmrc` con `node-linker=hoisted`, richiesto da Expo/Metro).
- **`apps/web/package.json`**: Next.js `^14.2.15` (App Router), React `18.3.1`. Dipendenze dirette: `@professionisti/api-client`, `@professionisti/shared`, `@professionisti/ui` (workspace), `leaflet` + `react-leaflet` (mappa risultati ricerca). **Nessuna dipendenza Tailwind, nessuna dipendenza icone.**
- **`next.config.mjs`**: minimale — `reactStrictMode: true`, `transpilePackages: ["@professionisti/ui", "@professionisti/shared"]` (necessario perché quei package non vengono pre-compilati in `dist/`, sono consumati come sorgente TS da Next.js).
- **`tailwind.config.*`**: **non esiste, in nessun package del repo.**
- **`tsconfig.json`** (`apps/web`): estende `@professionisti/config/tsconfig.nextjs.json`, alias `@/*` → `./src/*`.
- **Design system**: `packages/ui` (Tamagui `1.144.4`, `@tamagui/config` stock, `react-native-web` per compatibilità web). Nessun file di token di brand: `createTamagui(defaultConfig)` puro, vedi sopra.
- **Backend**: NestJS separato (`apps/api`), Prisma + PostgreSQL (no PostGIS in produzione, vedi `CLAUDE.md`), deploy Railway. Web deploy su Vercel.

---

## 2. Mappa route — `apps/web/src/app/`

```
app/
├── layout.tsx                              root layout (header + footer + providers)
├── page.tsx                                / — homepage (SSR, no-store)
├── HomeContent.tsx                         contenuto client della home
├── providers.tsx                           AuthProvider + TamaguiProvider
├── globals.css                             reset minimo, font di sistema
│
├── accedi/page.tsx                         login email+password / Google
├── registrati/page.tsx                     registrazione cliente/professionista (?ruolo=professionista)
├── password-dimenticata/page.tsx           reset password
│
├── cerca/
│   ├── page.tsx                            /cerca — tutti i professionisti (SSR)
│   ├── CercaContent.tsx
│   └── [categoria]/
│       ├── page.tsx                        /cerca/[categoria] — SSR per categoria+città
│       └── CategoryContent.tsx
│
├── professionista/[id]/
│   ├── page.tsx                            profilo pubblico professionista (SSR, force-dynamic)
│   └── ProfessionalDetailContent.tsx
│
├── preventivo/
│   ├── page.tsx                            /preventivo — richiesta guidata standard
│   └── PreventivoContent.tsx
├── urgente/
│   ├── page.tsx                            /urgente — richiesta guidata urgente (instant-match)
│   └── UrgenteContent.tsx
│
├── le-mie-richieste/page.tsx                area cliente: richieste inviate + prenotazioni + recensioni
├── account/page.tsx                         impostazioni account (nome, email, password, cancellazione)
├── professionisti-salvati/page.tsx          lista professionisti salvati (♡)
│
├── dashboard/
│   ├── page.tsx                             dashboard professionista: lead ricevuti, preventivi, boost, prenotazioni
│   ├── profilo/page.tsx                     editor profilo pubblico professionista
│   └── agenda/page.tsx                      editor disponibilità settimanale + prenotazione diretta
│
├── per-professionisti/
│   ├── page.tsx                             landing commerciale piani SaaS
│   └── PerProfessionistiContent.tsx
│
└── admin/
    ├── page.tsx                             pannello admin (nessun link in UI, URL diretto)
    └── promuovi/page.tsx                    self-service promozione ad admin (protetto da secret)
```

**Tutte le route sopra esistono e sono raggiungibili** (verificato leggendo l'albero file, non solo l'homepage pubblica) — a differenza di quanto la nota finale del brief ipotizzava. Nessuna route del brief (`/servizi/[categoria]`, `/richiedi-preventivo`, `/prezzi`) esiste con quel nome: i loro equivalenti reali sono `/cerca/[categoria]`, `/preventivo`, `/per-professionisti` (che include i 3 piani inline, non una pagina `/prezzi` dedicata).

`apps/mobile/app/` (Expo Router, per completezza — condivide `packages/ui` con web):
```
app/
├── _layout.tsx
├── index.tsx                filter categorie + ricerca
└── cerca/[categoria].tsx
```

---

## 3. Componenti — `apps/web/src/components/` e `packages/ui/src/`

### `apps/web/src/components/` (web-only, per costruzione — leggono `window`/DOM o sono legati a Next.js)

| Componente | Riga | Descrizione |
|---|---|---|
| `AccountMenu.tsx` | 95 | Menu a tendina account nell'header, voci diverse per ruolo cliente/professionista |
| `AccountSidebar.tsx` | 42 | Sidebar di navigazione nelle pagine account (`/account`, `/le-mie-richieste`, ecc.) |
| `AuthInput.tsx` | 28 | Input con icona per i form di login/registrazione |
| `CategoryIconBadge.tsx` | 28 | Badge icona colorata per categoria (fallback quando non c'è foto profilo) |
| `CategoryTile.tsx` | 30 | Card categoria cliccabile nella griglia homepage |
| `FadeInSection.tsx` | 47 | Wrapper reveal-on-scroll (IntersectionObserver, `opacity`+`translateY`) |
| `GoogleSignInButton.tsx` | 124 | Pulsante "Continua con Google", wrappa il widget ufficiale Google Identity Services |
| `GuidedRequestForm.tsx` | 361 | Form condiviso da `/preventivo` e `/urgente`: categoria, descrizione, foto, città |
| `ImageCropModal.tsx` | 267 | Ritaglio circolare immagine profilo prima dell'upload (canvas nativo) |
| `PhotoLightbox.tsx` | 124 | Overlay a schermo intero per foto recensioni/avatar, nav prev/next |
| `ProfessionalAvatar.tsx` | 24 | Immagine profilo o fallback icona categoria |
| `ResultsListWithMap.tsx` | 224 | Layout lista+mappa risultati ricerca (responsive via styled-jsx) |
| `ResultsMap.tsx` | 234 | Mappa Leaflet con marker professionisti |
| `SearchHeader.tsx` | 40 | Header di ricerca nelle pagine risultati |
| `SiteFooter.tsx` | 85 | Footer sito |
| `SiteHeader.tsx` | 44 | Header sito con logo, login, CTA "Sei un professionista?" |
| `StarRating.tsx` | 51 | Stelle proporzionali al voto medio (frazionarie) + conteggio recensioni |
| `icons/CategoryIcons.tsx` | 188 | Icone SVG custom per le 13 categorie professionali + mappa colori accento |

### `packages/ui/src/` (condivisi web+mobile, Tamagui)

| Componente | Riga | Descrizione |
|---|---|---|
| `Button.tsx` | 15 | Bottone base Tamagui |
| `ProfessionalCard.tsx` | 112 | Card professionista in ricerca (nome, categoria, città, indirizzo, prestazioni, rating) |
| `CategoryCard.tsx` | 32 | Card categoria (usata su mobile) |
| `SearchBar.tsx` | 146 | Barra di ricerca con tab "A domicilio"/"Online", autocomplete |
| `Autocomplete.tsx` | 122 | Dropdown autocomplete generico (categorie, comuni) |
| `Hero.tsx` | 101 | Hero homepage con ricerca + CTA urgente/preventivo |
| `IconFeature.tsx` | 21 | Blocco icona+titolo+descrizione (sezione "come funziona" home) |
| `CategoryChips.tsx` | 34 | Chip cliccabili per sotto-categorie/keyword |
| `TestimonialCard.tsx` | 34 | Card recensione/consiglio con stelle |
| `config.ts` | 9 | `createTamagui()` — config **stock**, nessun token di brand |
| `index.ts` | — | Ri-esporta le primitive Tamagui (`Text`, `XStack`, `YStack`, `H1`...) — **regola di progetto**: mai importarle direttamente da `"tamagui"` in `apps/web`/`apps/mobile` |

---

## 4. Emoji usate come icone

Verificate via scansione diretta dei file sorgente (grep con range Unicode via script Python, non solo pattern semplice — il locale POSIX del sistema impediva a `grep -P` di interpretare i codepoint richiesti dal brief, aggirato con `re` di Python).

**51 occorrenze in 22 file**, distribuite sia in `apps/web/src` (18 file) sia — punto rilevante — in **`packages/ui/src`** (4 file: `Hero.tsx`, `ProfessionalCard.tsx`, `SearchBar.tsx`, `TestimonialCard.tsx`), quindi condivise con l'app mobile.

Elenco completo per file:

- `apps/web/src/app/HomeContent.tsx` — 🔍 📷 🧾 🔔 📊 🤖 (6)
- `apps/web/src/app/accedi/page.tsx` — ✉️ 🔒 🙈 👁️ (3)
- `apps/web/src/app/account/page.tsx` — ✕ (1)
- `apps/web/src/app/dashboard/agenda/page.tsx` — ✓ 📅 ✕ (3)
- `apps/web/src/app/dashboard/page.tsx` — 🔴 ✕ (2)
- `apps/web/src/app/dashboard/profilo/page.tsx` — 📷 ✓ 📹 ✕ (4)
- `apps/web/src/app/le-mie-richieste/page.tsx` — ✓ ⭐ ☆ ✕ (3)
- `apps/web/src/app/per-professionisti/PerProfessionistiContent.tsx` — ✓ (1)
- `apps/web/src/app/professionista/[id]/ProfessionalDetailContent.tsx` — ✓ 📍 ⭐ ♥ ♡ (5)
- `apps/web/src/app/registrati/page.tsx` — 👤 ✉️ 🔒 🙈 👁️ (4)
- `apps/web/src/app/urgente/UrgenteContent.tsx` — 🔴 (1)
- `apps/web/src/components/GuidedRequestForm.tsx` — ✕ (1)
- `apps/web/src/components/ImageCropModal.tsx` — 🔍 (1)
- `apps/web/src/components/PhotoLightbox.tsx` — ✕ (1)
- `apps/web/src/components/ResultsListWithMap.tsx` — ✕ 🗺️ (1 riga)
- `apps/web/src/components/ResultsMap.tsx` — ⭐ ✕ (2)
- `apps/web/src/components/SiteFooter.tsx` — 🛠️ (1)
- `apps/web/src/components/SiteHeader.tsx` — 🛠️ (1, logo)
- **`packages/ui/src/Hero.tsx`** — 🔍 ⚡ 📋 (3) — **condiviso mobile**
- **`packages/ui/src/ProfessionalCard.tsx`** — 📍 ⭐ 📹 (3) — **condiviso mobile**
- **`packages/ui/src/SearchBar.tsx`** — 🏠 📹 (2) — **condiviso mobile**
- **`packages/ui/src/TestimonialCard.tsx`** — ★ ☆ (2) — **condiviso mobile**

La mappatura proposta dal brief (Search, Zap, FileText, ecc.) copre bene i casi in `apps/web`. Va decisa esplicitamente la strategia per i 4 file in `packages/ui` prima di toccarli (vedi sezione disallineamenti).

---

## 5. Dove vivono i dati

- **Database**: PostgreSQL + Prisma (`packages/database/prisma/schema.prisma`), niente PostGIS in produzione (Railway). Nessun dato hardcoded per entità di dominio (utenti, profili, richieste, preventivi, prenotazioni, recensioni sono tutte tabelle reali).
- **Costanti condivise, non "dati finti"**: `packages/shared/src/categories.ts` (13 categorie + sotto-tag + prestazioni popolari), `packages/shared/src/data/comuni.ts` (~7900 comuni ISTAT, dataset statico legittimo, non demo).
- **Backend**: NestJS (`apps/api`), consumato dal frontend via `packages/api-client` (client tipizzato, fetch verso l'URL configurato in `NEXT_PUBLIC_API_URL`).
- **Homepage**: `page.tsx` fa fetch server-side (`force-dynamic`, `cache: "no-store"`) dei professionisti reali da `GET /professionals/search`, passati come prop a `HomeContent`. **Non è un mock**: la sezione "Professionisti su Professionisti" mostra dati reali dal DB.

---

## 6. Form esistenti e gestione submit/validazione

Pattern uniforme in tutto il sito, **nessuna Server Action**:

1. Zod schema condiviso in `packages/shared/src/schemas.ts` (es. `guidedRequestSchema`, `professionalProfileSchema`, `reviewSchema`, `quoteSchema`...).
2. Componente client (`"use client"`) con `useState` per ogni campo, validazione **anche lato client** prima della chiamata (early return + `setError`), poi chiamata a `apps/api` via `packages/api-client`.
3. Validazione **autoritativa lato server** nel controller NestJS, tramite un `ZodValidationPipe` custom (`apps/api/src/common/zod-validation.pipe.ts`) che riusa lo stesso schema Zod — quindi client e server condividono la regola, non solo il tipo.
4. Errori mostrati inline sotto il form (`<Text color="$red10">`), non un pattern `useFormState`.

Form principali individuati: login (`/accedi`), registrazione (`/registrati`), richiesta guidata (`GuidedRequestForm`, usato da `/preventivo` e `/urgente`), editor profilo professionista (`/dashboard/profilo`), editor agenda (`/dashboard/agenda`), invio preventivo (`LeadCard` in `/dashboard`), recensione con foto (`/le-mie-richieste`), modifica/eliminazione richiesta (`/le-mie-richieste`), impostazioni account (`/account`), promozione admin (`/admin/promuovi`).

Upload immagini: **client-side**, `<input type="file">` nativo (mai un componente drag&drop dedicato), upload verso endpoint NestJS dedicati che caricano su **Cloudinary** (non Vercel Blob/S3 come suggerisce il brief — decisione già presa e documentata in `CLAUDE.md` §2, motivata da nessuna carta di pagamento richiesta sul piano free).

Rate limiting / honeypot / anti-spam sull'invio richieste: **non presente oggi**, punto valido del brief da pianificare in Fase 6.

---

## 7. Dati demo/fake in produzione — trovato un problema reale

- **`packages/database/prisma/seed.ts`** usa `PLACEHOLDER_PROFESSIONALS` (10 profili fittizi con nomi come "Rossi Impianti", "Bianchi Idraulica", email `@demo.professionisti.it`) per popolare `User`+`ProfessionalProfile` reali nel database, in modo idempotente (`upsert`). Se questo script è stato eseguito anche contro il database di produzione (non verificabile da qui senza accesso a Railway), quei profili demo sono realmente in vetrina — indistinguibili per un utente da un professionista vero, a parte l'email `@demo.professionisti.it` mai mostrata in UI.
- **`apps/web/src/app/HomeContent.tsx`** (righe 144–169): la sezione "Professionisti su Professionisti" mostra i **primi 10 risultati reali** di `GET /professionals/search` (non un mock), ma sotto la lista mostra sempre la scritta statica **"Profili dimostrativi: i primi professionisti reali arriveranno con il lancio della piattaforma."** — indipendentemente da quali professionisti reali/demo compaiano davvero. Questa etichetta è **fuorviante non appena esiste anche un solo professionista reale**: dichiara "demo" un elenco che può contenere dati veri.
- Il profilo singolo descritto nel brief ("Rossss — Idraulico · Latina · Via Milazzo 1 · ⭐5.0") **non corrisponde a nessun nome in `PLACEHOLDER_PROFESSIONALS`** (che contiene "Rossi Impianti", non "Rossss"): è quasi certamente un account creato manualmente durante un test sul sito live (nome placeholder digitato a mano), non dato del seed script. Da verificare/rimuovere direttamente in produzione (Railway), non risolvibile lato codice.
- `PROFESSIONAL_TIPS` e `CLIENT_REVIEWS` in `HomeContent.tsx` (righe 37–54) sono **esplicitamente marcati nel codice** come `// Dati di esempio: da sostituire con recensioni/professionisti reali quando la piattaforma avrà utenti.` — coerente con quanto segnalato dal brief in 4.5, stessa diagnosi: da rimuovere o sostituire con un blocco "come garantiamo la qualità" finché non ci sono recensioni reali.
- **Indirizzo civico esposto**: `ProfessionalDetailContent.tsx` riga 129 mostra `📍 {professional.address}` — l'indirizzo è quello inserito liberamente dal professionista in `/dashboard/profilo` (campo facoltativo, testo libero, non validato come "solo quartiere/comune"). Il punto del brief ("mai l'indirizzo esatto in vetrina") è quindi un **problema di prodotto pre-esistente reale**, non solo del profilo demo: qualunque professionista reale che inserisce il proprio indirizzo di casa/studio lo espone integralmente oggi.

---

## Prossimi passi

In attesa di conferma su:
1. **Come riconciliare il sistema di token/componenti del brief con Tamagui condiviso web+mobile** (estendere `packages/ui` vs. introdurre Tailwind solo in `apps/web` accettando la divergenza da mobile).
2. **Strategia icone per i 4 file condivisi in `packages/ui`** (Hero, ProfessionalCard, SearchBar, TestimonialCard) — `lucide-react` lì romperebbe la build mobile.
3. **Conferma se procedere con la rimozione dei dati demo** (sezione 7) come parte della Fase 1 o come intervento a parte, dato che tocca produzione (seed / account creati a mano) non solo codice.

Non procedo alla Fase 1 finché questi punti non sono chiariti, come da istruzione del brief.
