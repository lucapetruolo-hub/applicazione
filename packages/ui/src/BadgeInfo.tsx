import type { ReactNode } from "react";
import { View } from "tamagui";
import { BADGE_INFO, type BadgeInfoKey } from "./badgeInfo";

export type BadgeInfoProps = {
  info: BadgeInfoKey;
  children: ReactNode;
};

/**
 * Variante nativa (app): per ora il significato del badge arriva solo al
 * lettore di schermo. Il fumetto al tocco vive in BadgeInfo.web.tsx; l'app
 * lo avrà quando si costruisce per intero (decisione dell'utente).
 */
export function BadgeInfo({ info, children }: BadgeInfoProps) {
  const { text, note } = BADGE_INFO[info];
  return <View accessibilityHint={note ? `${text} ${note}` : text}>{children}</View>;
}
