"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Text, YStack } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { getAccountMenuItems } from "@/lib/accountMenuItems";

export function AccountMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const items = getAccountMenuItems(user.role);

  return (
    <YStack ref={containerRef} position="relative">
      <YStack
        flexDirection="row"
        alignItems="center"
        gap="$1"
        cursor="pointer"
        onPress={() => setIsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel="Il mio account"
      >
        <Text fontSize="$3" fontWeight="600" color="$color11">
          {user.name ?? user.phone ?? user.email}
        </Text>
        <Text fontSize="$2" color="$color9">
          {isOpen ? "▲" : "▼"}
        </Text>
      </YStack>

      {isOpen ? (
        <YStack
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          minWidth={220}
          backgroundColor="white"
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$4"
          overflow="hidden"
          zIndex={1000}
          shadowColor="$shadowColor"
          shadowRadius={12}
          shadowOpacity={0.15}
        >
          {items.map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }} onClick={() => setIsOpen(false)}>
              <YStack paddingHorizontal="$4" paddingVertical="$3" hoverStyle={{ backgroundColor: "$color3" }}>
                <Text fontSize="$3" color="$color12">
                  {item.label}
                </Text>
              </YStack>
            </Link>
          ))}
          <YStack borderTopWidth={1} borderTopColor="$borderColor">
            <YStack
              paddingHorizontal="$4"
              paddingVertical="$3"
              cursor="pointer"
              hoverStyle={{ backgroundColor: "$color3" }}
              onPress={() => {
                setIsOpen(false);
                logout();
              }}
              accessibilityRole="button"
              accessibilityLabel="Esci dal tuo account"
            >
              <Text fontSize="$3" color="$red10" fontWeight="600">
                Esci
              </Text>
            </YStack>
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}
