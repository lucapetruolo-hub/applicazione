"use client";

import Link from "next/link";
import { Icon, Text, XStack, brand } from "@professionisti/ui";
import { useWhatsAppStatus } from "@/lib/useWhatsAppStatus";

/**
 * Sotto un appuntamento in arrivo: "Ricevi il promemoria anche su WhatsApp"
 * (docs/changelog/2026-10-28-promemoria-whatsapp.md). Solo quando i
 * promemoria su WhatsApp sono attivi sul sito e la persona non li ha ancora
 * accesi: porta alla scheda WhatsApp di Notifiche, dove si conferma il numero.
 * Nell'agenda del professionista, sotto il prossimo appuntamento, parla del
 * riepilogo della sera prima.
 */
export function WhatsAppReminderLink({
  token,
  label = "Ricevi il promemoria anche su WhatsApp",
  className,
}: {
  token: string;
  label?: string;
  /** In più alla classe del link, es. la scheda dell'agenda. */
  className?: string;
}) {
  const status = useWhatsAppStatus(token);
  if (!status?.available || status.enabled) return null;
  return (
    <Link href="/account/notifiche#whatsapp" className={`whatsapp-reminder-link${className ? ` ${className}` : ""}`}>
      <XStack alignItems="flex-start" gap="$2">
        <span style={{ display: "inline-flex", marginTop: 3, flexShrink: 0 }}>
          <Icon name="message-circle" size={16} color={brand.cianografiaScuro} />
        </span>
        <Text fontSize={16} fontWeight="600" color={brand.cianografiaScuro}>
          {label}
        </Text>
      </XStack>
    </Link>
  );
}
