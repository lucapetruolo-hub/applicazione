"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button, Icon, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";

const REASONS: { icon: IconName; text: string }[] = [
  { icon: "shield-check", text: "Controlliamo che codice fiscale e partita IVA siano validi." },
  { icon: "file-text", text: "Ogni anno la legge ci chiede di comunicare al fisco i compensi ricevuti tramite il sito (DAC7)." },
  { icon: "eye-off", text: "Restano privati: nessun cliente li vede." },
];

/**
 * "Perché li chiediamo" nei dati fiscali (richiesta dell'utente,
 * docs/CHANGELOG.md §272): la spiegazione si apre sopra il modulo, così chi
 * sta compilando non lascia la pagina e non perde quello che ha scritto.
 * Stesso schema delle altre finestre del sito (Esc e tocco fuori chiudono).
 */
export function FiscalWhyModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fiscal-why-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(43,32,19,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 400,
      }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 420 }}>
        <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5" gap="$4">
          <Text id="fiscal-why-title" tag="h2" fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Perché ti chiediamo questi dati
          </Text>
          <YStack gap="$3">
            {REASONS.map((reason) => (
              <XStack key={reason.icon} gap="$3" alignItems="flex-start">
                <YStack width={32} height={32} borderRadius={999} alignItems="center" justifyContent="center" backgroundColor={brand.cianografiaVelo} flexShrink={0}>
                  <Icon name={reason.icon} size={16} strokeWidth={2} color={brand.cianografiaScuro} />
                </YStack>
                <Text flex={1} fontSize={15} color={brand.grafite} paddingTop={5}>
                  {reason.text}
                </Text>
              </XStack>
            ))}
          </YStack>
          <XStack alignItems="center" justifyContent="space-between" gap="$3" flexWrap="wrap">
            <Link href="/privacy" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700, fontSize: 14 }}>
              Privacy
            </Link>
            <div ref={closeRef}>
              <Button variant="primary" onPress={onClose}>
                Ho capito
              </Button>
            </div>
          </XStack>
        </YStack>
      </div>
    </div>
  );
}
