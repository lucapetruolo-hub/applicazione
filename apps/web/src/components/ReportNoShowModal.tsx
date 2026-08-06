"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * "Non presentato" (richiesta esplicita dell'utente): disponibile al
 * cliente su un lavoro CONFIRMED dopo che la data/ora prevista è passata.
 * Offre due strade, non una sola azione automatica: contattare il
 * professionista (rivela telefono/indirizzo/email) oppure segnalare la
 * mancata presentazione e chiedere un rimborso. Nessun pagamento reale da
 * rimborsare in piattaforma (non ancora attivo, CLAUDE.md §9): la
 * segnalazione è una richiesta/notifica al professionista, il rimborso
 * vero va concordato direttamente con lui nel frattempo — stesso principio
 * "onesto, non finto" già seguito per "Vai al pagamento" altrove nel sito.
 * Stesso pattern overlay di ClientProfileModal/CancelBookingModal.
 */
export function ReportNoShowModal({
  businessName,
  phone,
  email,
  address,
  onClose,
  onRequestRefund,
}: {
  businessName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  onClose: () => void;
  onRequestRefund: () => Promise<void>;
}) {
  const [view, setView] = useState<"choice" | "contact" | "refundSent">("choice");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleRequestRefund() {
    setError(null);
    setIsSaving(true);
    try {
      await onRequestRefund();
      setView("refundSent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Non presentato"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={420}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1.5}
        borderColor={brand.urgenza}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        <XStack width="100%" justifyContent="space-between" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Non presentato
          </Text>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        {view === "choice" ? (
          <>
            <Text fontSize="$3" color={brand.grafite70}>
              {businessName} non si è presentato all'appuntamento previsto? Puoi contattarlo direttamente oppure segnalare la mancata
              presentazione e chiedere un rimborso.
            </Text>
            <YStack gap="$2">
              <Button variant="secondary" size="$3" height={48} onPress={() => setView("contact")}>
                Contatta {businessName}
              </Button>
              <Button variant="urgent" size="$3" height={48} onPress={handleRequestRefund} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
                {isSaving ? "Invio segnalazione..." : "Richiedi un rimborso"}
              </Button>
            </YStack>
            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}
          </>
        ) : null}

        {view === "contact" ? (
          <>
            <YStack gap="$2">
              {phone ? (
                <a href={`tel:${phone}`} style={{ textDecoration: "none" }}>
                  <XStack alignItems="center" gap="$2">
                    <Icon name="phone" size={14} color={brand.cianografia} strokeWidth={1.5} />
                    <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                      {phone}
                    </Text>
                  </XStack>
                </a>
              ) : null}
              {email ? (
                <a href={`mailto:${email}`} style={{ textDecoration: "none" }}>
                  <XStack alignItems="center" gap="$2">
                    <Icon name="mail" size={14} color={brand.cianografia} strokeWidth={1.5} />
                    <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                      {email}
                    </Text>
                  </XStack>
                </a>
              ) : null}
              {address ? (
                <XStack alignItems="center" gap="$2">
                  <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
                  <Text color={brand.grafite} fontSize="$3">
                    {address}
                  </Text>
                </XStack>
              ) : null}
              {!phone && !email && !address ? (
                <Text fontSize="$3" color={brand.grafite70}>
                  Nessun contatto disponibile per questo professionista.
                </Text>
              ) : null}
            </YStack>
            <Button variant="ghost" size="$3" height={44} onPress={() => setView("choice")}>
              Torna indietro
            </Button>
          </>
        ) : null}

        {view === "refundSent" ? (
          <>
            <Text fontSize="$3" color={brand.grafite}>
              Abbiamo avvisato {businessName} della tua segnalazione. Il pagamento in piattaforma non è ancora attivo: per ora il rimborso va
              concordato direttamente con il professionista.
            </Text>
            <Button variant="secondary" size="$3" height={44} onPress={onClose}>
              Chiudi
            </Button>
          </>
        ) : null}
      </YStack>
    </div>
  );
}
