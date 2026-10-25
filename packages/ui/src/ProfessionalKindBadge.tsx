import { Text, XStack } from "tamagui";
import { BadgeInfo } from "./BadgeInfo";
import type { BadgeInfoKey } from "./badgeInfo";
import { Icon, type IconName } from "./Icon";
import { brand } from "./tokens";

// Duplicato di `ProfessionalKind` (packages/shared): packages/ui non dipende da shared.
export type ProfessionalKindValue = "PRIVATE" | "VAT" | "BUSINESS";

const KIND: Record<ProfessionalKindValue, { label: string; icon: IconName; info: BadgeInfoKey }> = {
  PRIVATE: { label: "Privato", icon: "user-round", info: "kindPrivate" },
  VAT: { label: "Partita IVA", icon: "briefcase", info: "kindVat" },
  BUSINESS: { label: "Azienda", icon: "building-2", info: "kindBusiness" },
};

/**
 * Come si è iscritto il professionista (docs/CHANGELOG.md §337): privato,
 * partita IVA o azienda, con il significato nel fumetto. Pillola neutra
 * (bianca con bordo): è un'informazione, non un merito né un pagamento.
 * `md` per la scheda del profilo, accanto ai `Badge`; `sm` per le schede dei risultati.
 */
export function ProfessionalKindBadge({ kind, size = "sm" }: { kind: ProfessionalKindValue; size?: "sm" | "md" }) {
  const { label, icon, info } = KIND[kind];
  const md = size === "md";
  return (
    <BadgeInfo info={info}>
      <XStack
        alignItems="center"
        gap={4}
        paddingHorizontal={md ? 11 : "$2"}
        paddingVertical={md ? 4 : 1}
        borderRadius={999}
        backgroundColor={brand.calce}
        borderWidth={1}
        borderColor={brand.filetto}
      >
        <Icon name={icon} size={13} color={brand.grafite} strokeWidth={2} />
        <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
          {label}
        </Text>
      </XStack>
    </BadgeInfo>
  );
}
