"use client";

import { YStack, brand } from "@professionisti/ui";
import { ConversationView } from "@/components/ConversationView";

/**
 * Cronologia completa cliente↔professionista di una richiesta guidata
 * (richiesta esplicita dell'utente: "tieni traccia delle varie
 * conversazioni e aggiornamenti... così ognuno cliccando ad esempio sul
 * preventivo possa vedere la cronologia completa"), mostrata come popup —
 * stesso pattern overlay DOM grezzo già in uso per BookingDetailPanel/
 * ClientProfileModal (`role="dialog"`, chiusura con Escape/click sul
 * backdrop). Usato dai 5 punti di montaggio esistenti nel prodotto
 * (`/dashboard`, `/dashboard/richieste`, `/le-mie-richieste` ×2,
 * `/dashboard/agenda`) — il vero corpo della conversazione (stato,
 * scroll, allegati, push in tempo reale) vive in `ConversationView`, ora
 * riusata anche **inline, senza popup**, nel pannello di conversazione
 * della pagina `/chat` (richiesta esplicita dell'utente per quel
 * contesto). Questo file resta solo la cornice: backdrop + dimensione a
 * popup.
 */
export function TimelineModal({
  token,
  guidedRequestId,
  professionalProfileId,
  viewerRole,
  otherPartyName,
  onOpenClientProfile,
  onClose,
}: {
  token: string;
  guidedRequestId: string;
  professionalProfileId: string;
  viewerRole: "CLIENT" | "PROFESSIONAL";
  otherPartyName?: string | null;
  onOpenClientProfile?: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cronologia della richiesta"
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
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={520}
        maxHeight="85vh"
        backgroundColor={brand.calce}
        borderRadius="$3"
        overflow="hidden"
      >
        <ConversationView
          token={token}
          guidedRequestId={guidedRequestId}
          professionalProfileId={professionalProfileId}
          viewerRole={viewerRole}
          otherPartyName={otherPartyName}
          onOpenClientProfile={onOpenClientProfile}
          onBack={onClose}
          backIcon="x"
          escapeToBack
        />
      </YStack>
    </div>
  );
}
