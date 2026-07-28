import { Image } from "react-native";
import { Text, YStack } from "tamagui";
import { brand } from "./tokens";

export type AvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Foto reale se `imageUrl` è presente, altrimenti iniziali su fondo
 * cianografia-velo — mai un'icona placeholder generica (brief §3).
 * `Image` da "react-native" invece di un `<img>` DOM: risolve a un vero
 * `<img>` via react-native-web sul bundle Next.js (già dipendenza di questo
 * package) senza la stessa complicazione di react-native-svg (vedi
 * Logo.tsx/Logo.web.tsx) — `Image` è un componente foglia semplice, nessuna
 * dipendenza Flow-typed dietro al suo shim web.
 */
export function Avatar({ name, imageUrl, size = 40 }: AvatarProps) {
  if (imageUrl) {
    return (
      <YStack width={size} height={size} borderRadius={size / 2} overflow="hidden">
        <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} />
      </YStack>
    );
  }

  return (
    <YStack
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={brand.cianografiaVelo}
      alignItems="center"
      justifyContent="center"
    >
      <Text fontFamily="$heading" fontWeight="700" fontSize={size * 0.4} color={brand.cianografia}>
        {initials(name)}
      </Text>
    </YStack>
  );
}
