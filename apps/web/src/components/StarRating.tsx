"use client";

import { brand } from "@professionisti/ui";

/**
 * Stelline proporzionali alla media reale (es. 4.5 → 4 piene e mezza su 5),
 * non solo stelle intere: due righe di stelle sovrapposte (una grigia di
 * sfondo, una dorata ritagliata alla percentuale esatta del voto) invece di
 * arrotondare — tecnica CSS standard per rating frazionari, nessuna libreria
 * aggiunta. Web-only (apps/web), stesso principio di ProfessionalAvatar.
 */
function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block", flexShrink: 0 }}>
      <path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-4-6.3 4 1.7-7-5.4-4.7 7.1-.6z" />
    </svg>
  );
}

export function StarRating({
  rating,
  reviewCount,
  size = 20,
}: {
  rating: number;
  reviewCount?: number;
  size?: number;
}) {
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", display: "inline-flex" }}>
        <div style={{ display: "flex", gap: 2 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <StarIcon key={i} size={size} color={brand.filetto} />
          ))}
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, display: "flex", gap: 2, overflow: "hidden", width: `${percent}%` }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <StarIcon key={i} size={size} color={brand.ottone} />
          ))}
        </div>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: brand.grafite }}>{rating.toFixed(1)}</span>
      {reviewCount !== undefined ? (
        <span style={{ fontSize: 14, color: brand.grafite70 }}>
          ({reviewCount} recension{reviewCount === 1 ? "e" : "i"})
        </span>
      ) : null}
    </div>
  );
}
