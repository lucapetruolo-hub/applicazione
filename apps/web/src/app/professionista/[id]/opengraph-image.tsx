import { ImageResponse } from "next/og";
import { BRAND, professionalIdFromSlug } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `Profilo del professionista su ${BRAND.name}`;

const MARKER = "/image/upload/";

/**
 * Foto del profilo già ritagliata da Cloudinary (volto al centro, JPG che
 * next/og sa leggere), scaricata qui con un tempo massimo: se non arriva
 * l'anteprima esce con le iniziali, mai un errore. Solo foto su Cloudinary
 * (le uniche che il sito carica, CLAUDE.md §2).
 */
async function photoDataUrl(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl || !imageUrl.startsWith("https://res.cloudinary.com/") || !imageUrl.includes(MARKER)) return null;
  const url = imageUrl.replace(MARKER, `${MARKER}c_fill,g_face,w_420,h_420,f_jpg,q_80/`);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Anteprima del profilo su WhatsApp, Facebook e Telegram (collaudo 08/11
 * E8-06, docs/changelog/2026-11-08-seo-e-velocita.md): foto (o iniziali),
 * nome, mestiere e città sul verde del sito. I professionisti condividono il
 * link del loro profilo: l'anteprima deve dire subito chi sono.
 */
export default async function ProfessionalOpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const professional = await apiClient.getProfessional(professionalIdFromSlug(id)).catch(() => null);
  const photo = await photoDataUrl(professional?.imageUrl ?? null);
  const name = professional?.businessName ?? BRAND.name;
  const subtitle = professional ? `${professional.categoryLabel} a ${professional.city}` : "Trova un professionista vicino a te";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#4C8A7A", padding: "0 80px", gap: 56 }}>
        {photo ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- immagine dentro next/og, non nella pagina
          <img src={photo} width={300} height={300} style={{ borderRadius: 40, objectFit: "cover", border: "6px solid #FAF2E8" }} />
        ) : (
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: 40,
              background: "#386C5F",
              color: "white",
              fontSize: 120,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {initials(name) || "P"}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", color: "white", fontSize: name.length > 28 ? 54 : 66, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1 }}>{name}</div>
          <div style={{ display: "flex", color: "#FAF2E8", fontSize: 36 }}>{subtitle}</div>
          <div style={{ display: "flex", color: "#FAF2E8", fontSize: 28, marginTop: 24, opacity: 0.85 }}>{`Preventivi e appuntamenti su ${BRAND.name}`}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
