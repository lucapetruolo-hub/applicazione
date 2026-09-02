"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Text, YStack, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { getAccountMenuItems } from "@/lib/accountMenuItems";

export function AccountSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = getAccountMenuItems(user.role);

  return (
    <YStack width={220} gap="$1" flexShrink={0}>
      <Text
        fontFamily="$body"
        fontSize={12}
        fontWeight="700"
        color={brand.grafite70}
        paddingHorizontal="$3"
        paddingBottom="$2"
      >
        {/* Intestazione diversa per ruolo: per il cliente la prima voce del
            menu è già "Impostazioni dell'account", ripeterla qui creava una
            duplicazione confusa (segnalata nel tour pre-lancio). */}
        {user.role === "PROFESSIONAL" ? "Area professionista" : "Il tuo account"}
      </Text>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
            <YStack
              paddingHorizontal="$3"
              paddingVertical="$3"
              borderRadius="$2"
              backgroundColor={active ? brand.cianografiaVelo : "transparent"}
              hoverStyle={{ backgroundColor: active ? brand.cianografiaVelo : brand.gesso }}
              accessibilityRole="link"
            >
              <Text fontSize="$3" fontWeight={active ? "700" : "500"} color={active ? brand.cianografia : brand.grafite}>
                {item.label}
              </Text>
            </YStack>
          </Link>
        );
      })}
    </YStack>
  );
}
