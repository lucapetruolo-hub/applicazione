import { BadgeInfo } from "./BadgeInfo";
import type { BadgeInfoKey } from "./badgeInfo";
import { Icon, type IconName } from "./Icon";
import type { ProfessionalKindValue } from "./professionalKind";
import { brand } from "./tokens";
import styles from "./ProfessionalKindBadge.module.css";

export type { ProfessionalKindValue } from "./professionalKind";

/*
 * Variante per il sito di ProfessionalKindBadge.tsx in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto, senza il calcolo degli stili di Tamagui. Se cambia l'altro file, va
 * cambiato anche qui.
 */
const KIND: Record<ProfessionalKindValue, { label: string; icon: IconName; info: BadgeInfoKey }> = {
  PRIVATE: { label: "Privato", icon: "user-round", info: "kindPrivate" },
  VAT: { label: "Partita IVA", icon: "briefcase", info: "kindVat" },
  BUSINESS: { label: "Azienda", icon: "building-2", info: "kindBusiness" },
};

export function ProfessionalKindBadge({ kind, size = "sm" }: { kind: ProfessionalKindValue; size?: "sm" | "md" }) {
  const { label, icon, info } = KIND[kind];
  return (
    <BadgeInfo info={info}>
      <div className={`is_View ${styles.badge} ${size === "md" ? styles.md : styles.sm}`}>
        <Icon name={icon} size={13} color={brand.grafite} strokeWidth={2} />
        <span className={`is_Text font_body ${styles.text}`}>{label}</span>
      </div>
    </BadgeInfo>
  );
}
