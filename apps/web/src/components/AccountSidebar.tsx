"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Text, YStack } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { getAccountMenuItems } from "@/lib/accountMenuItems";

export function AccountSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const items = getAccountMenuItems(user.role);

  return (
    <YStack width={220} gap="$1" flexShrink={0}>
      <Text fontSize="$2" color="$color9" fontWeight="600" paddingHorizontal="$3" paddingBottom="$1">
        Impostazioni dell&apos;account
      </Text>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
            <YStack
              paddingHorizontal="$3"
              paddingVertical="$3"
              borderRadius="$4"
              backgroundColor={active ? "$color4" : "transparent"}
              hoverStyle={{ backgroundColor: "$color3" }}
            >
              <Text fontSize="$3" fontWeight={active ? "700" : "500"} color="$color12">
                {item.label}
              </Text>
            </YStack>
          </Link>
        );
      })}
    </YStack>
  );
}
