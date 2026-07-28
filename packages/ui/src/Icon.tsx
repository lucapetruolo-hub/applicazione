import { ICONS, type IconName } from "./icons";
import { brand } from "./tokens";

export type { IconName };

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Riempimento SVG (es. stelle piene su rating) — di default nessun riempimento, solo contorno. */
  fill?: string;
};

/**
 * Icona cross-platform: "./icons" risolve a icons.web.tsx (lucide-react) su
 * Next.js o a icons.tsx (lucide-react-native) su Expo — stesso nome, resa
 * nativa su ciascuna piattaforma, un solo componente da chiamare qui.
 * `color` è un valore letterale (hex/rgba), non un token Tamagui `$nome`:
 * lucide non capisce la sintassi dei token, solo CSS/RN color reali —
 * default a `brand.grafite`, mai "currentColor" (non esiste su React Native).
 */
export function Icon({ name, size = 20, color = brand.grafite, strokeWidth = 1.5, fill = "none" }: IconProps) {
  const Component = ICONS[name];
  return <Component size={size} color={color} strokeWidth={strokeWidth} fill={fill} />;
}
