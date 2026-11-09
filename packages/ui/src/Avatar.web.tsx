import { Image } from "react-native";
import type { AvatarProps } from "./avatarProps";
import styles from "./Avatar.module.css";

export type { AvatarProps } from "./avatarProps";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Variante per il sito di `Avatar` (Avatar.tsx) in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto, senza il calcolo degli stili di Tamagui. La foto resta l'`Image`
 * di React Native come prima. Se cambia l'aspetto in Avatar.tsx, va cambiato
 * anche qui.
 */
export function Avatar({ name, imageUrl, size = 40 }: AvatarProps) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (imageUrl) {
    return (
      <div className={`is_View ${styles.photo}`} style={box}>
        <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} />
      </div>
    );
  }
  return (
    <div className={`is_View ${styles.initials}`} style={box}>
      <span className={`is_Text font_heading ${styles.letters}`} style={{ fontSize: size * 0.4 }}>
        {initials(name)}
      </span>
    </div>
  );
}
