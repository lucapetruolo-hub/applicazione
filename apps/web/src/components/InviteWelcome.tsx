"use client";

import { useEffect, useState } from "react";
import { INVITE_PARAM, isInviteCode, type InviteSender } from "@professionisti/shared";
import { Icon, Text, XStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

/**
 * "Ti ha invitato …" su /per-professionisti aperta da un invito "Porta un
 * collega" o dal link di un partner (docs/changelog/2026-11-09-passaparola.md):
 * chi apre vede subito di chi si fida. Solo con `?invito=` valido; se il
 * nome non arriva, niente riga.
 */
export function InviteWelcome() {
  const [sender, setSender] = useState<InviteSender | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get(INVITE_PARAM)?.trim().toLowerCase();
    if (!code || !isInviteCode(code)) return;
    let active = true;
    apiClient
      .resolveInvite(code)
      .then((found) => {
        if (active) setSender(found);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!sender) return null;
  return (
    <XStack gap="2" alignItems="center" role="status">
      <Icon name={sender.kind === "PROFESSIONAL" ? "user-round" : "badge-check"} size={16} color={brand.cianografiaScuro} strokeWidth={1.75} />
      <Text fontSize={16} color={brand.grafite}>
        {sender.kind === "PROFESSIONAL" ? "Ti ha invitato " : "Ti presenta il sito "}
        <Text render="span" fontWeight="700" color={brand.grafite}>
          {sender.name}
        </Text>
      </Text>
    </XStack>
  );
}
