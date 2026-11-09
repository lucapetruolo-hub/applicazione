// Duplicato di `ProfessionalKind` (packages/shared): packages/ui non dipende da shared.
// In un file suo perché ProfessionalKindBadge.web.tsx non può importare "./ProfessionalKindBadge" (porterebbe a sé stesso).
export type ProfessionalKindValue = "PRIVATE" | "VAT" | "BUSINESS";
