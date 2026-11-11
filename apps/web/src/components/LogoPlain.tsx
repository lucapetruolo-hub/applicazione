import styles from "./LogoPlain.module.css";

// Colori del marchio: brand.cianografia e brand.grafite (packages/ui/src/tokens.ts).
const MARK_COLOR = "#4C8A7A";

/**
 * Logo (quadrato + nome) in HTML semplice, senza Tamagui, per le parti
 * preparate dal server (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md).
 * Stesso disegno di `Logo` in packages/ui/src/Logo.web.tsx: se cambia lì,
 * va cambiato anche qui. Il quadrato accanto al nome è decorativo; da solo
 * (`variant="mark"`, barra in alto da telefono) è letto col nome.
 */
export function LogoPlain({ name, size = 28, variant = "full" }: { name: string; size?: number; variant?: "full" | "mark" }) {
  if (variant === "mark") {
    // Da solo (telefoni) il quadrato è l'unico segno del marchio: letto col nome, come in Logo.web.tsx.
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" role="img" aria-label={name}>
        <rect width={28} height={28} rx={9} fill={MARK_COLOR} />
        <line x1={9} y1={7} x2={9} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
        <line x1={9} y1={21} x2={21} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <div className={`is_View ${styles.logo}`}>
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
        <rect width={28} height={28} rx={9} fill={MARK_COLOR} />
        <line x1={9} y1={7} x2={9} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
        <line x1={9} y1={21} x2={21} y2={21} stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      </svg>
      <span className={`is_Text font_heading ${styles.name}`} style={{ fontSize: size * 0.7 }}>
        {name}
      </span>
    </div>
  );
}
