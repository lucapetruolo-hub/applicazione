"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { BookingDetailPanel } from "@/components/calendar/BookingDetailPanel";
import { SlotDraft, isSlotGeneric } from "./agendaHelpers";

/**
 * Casellina di spunta (richiesta esplicita dell'utente): in modalità
 * selezione, ogni fascia oraria e ogni "Seleziona giorno" mostrano ora un
 * riquadro cliccabile riconoscibile invece del solo cambio di colore del
 * testo/icona — segnale visivo più immediato che quell'elemento è
 * selezionabile.
 */
export function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <XStack
      width={14}
      height={14}
      flexShrink={0}
      borderRadius={3}
      borderWidth={1.5}
      borderColor={brand.cianografia}
      backgroundColor={checked ? brand.cianografia : brand.calce}
      alignItems="center"
      justifyContent="center"
    >
      {checked ? <Icon name="check" size={9} color="white" strokeWidth={3} /> : null}
    </XStack>
  );
}

export function SlotChip({
  slot,
  isConflicting,
  isEditing,
  isSelected,
  onEdit,
}: {
  slot: SlotDraft;
  /** True se la fascia in modifica altrove nello stesso giorno si sovrappone a questa — colorata di rosso anche lei, non solo il riquadro in modifica (richiesta esplicita dell'utente). */
  isConflicting: boolean;
  /** True mentre questa fascia è aperta nel pop-up di modifica: evidenziata per farla ritrovare facilmente quando si chiude. */
  isEditing: boolean;
  /** True in modalità selezione (tasto "Modifica") quando questa fascia è tra quelle scelte per l'eliminazione in blocco. */
  isSelected?: boolean;
  onEdit: () => void;
}) {
  const isGeneric = isSlotGeneric(slot);
  // Solo l'orario, in piccolo, per restare dentro la colonna anche nella
  // vista Settimana (richiesta esplicita dell'utente): tutto il resto
  // (modifica, capienza, eliminazione) si apre nel pop-up di modifica
  // (SlotEditorModal) toccando l'intera fascia — niente più tasto "×" a
  // parte: su cellulare si sovrapponeva al riquadro della fascia, poco
  // chiaro, richiesta esplicita dell'utente.
  return (
    <XStack
      borderWidth={isConflicting || isEditing || isSelected ? 1.5 : 1}
      borderStyle={isGeneric && !isConflicting && !isSelected ? "dashed" : "solid"}
      borderColor={isConflicting ? brand.urgenza : isEditing || isSelected ? brand.cianografia : isGeneric ? brand.ottone : brand.cianografia}
      borderRadius="$2"
      paddingHorizontal="$1.5"
      paddingVertical={5}
      alignItems="center"
      gap={3}
      minWidth={0}
      cursor="pointer"
      backgroundColor={isConflicting ? brand.urgenzaVelo : isEditing || isSelected ? brand.cianografiaVelo : brand.calce}
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={isSelected !== undefined ? `${isSelected ? "Deseleziona" : "Seleziona"} fascia ${slot.start}–${slot.end}` : `Modifica fascia ${slot.start}–${slot.end}`}
    >
      {isSelected !== undefined ? (
        <SelectionCheckbox checked={isSelected} />
      ) : slot.hasUpcomingBooking ? (
        <Icon name="bell-ring" size={9} color={brand.urgenza} />
      ) : null}
      <Text fontFamily="$mono" fontSize={10} fontWeight="700" color={isGeneric && !isSelected ? brand.ottone : brand.cianografia}>
        {slot.start}–{slot.end}
      </Text>
      {/* Simbolo "online" in piccolo sulla fascia (richiesta esplicita
          dell'utente) quando è stata spuntata la modalità online. */}
      {slot.allowsOnline ? <Icon name="video" size={9} color={brand.verificato} /> : null}
    </XStack>
  );
}

export const modalTimeInputStyle = {
  padding: 12,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 17,
  fontFamily: "inherit",
  color: brand.grafite,
  width: 130,
  minWidth: 0,
};
export const modalMaxInputStyle = { ...modalTimeInputStyle, width: 80, textAlign: "center" as const };

/**
 * Pop-up per impostare/modificare una fascia oraria, aperto sia dal tasto
 * "+" (nuova fascia) sia cliccando una fascia già impostata: prima gli
 * stessi campi stavano incastrati in un riquadro minuscolo dentro la
 * colonna del calendario, illeggibile — richiesta esplicita dell'utente di
 * aprirli invece in un overlay grande, stesso pattern DOM di
 * BookingDetailPanel/PhotoLightbox (role="dialog", chiusura con Escape o
 * click sul backdrop, nessuna libreria aggiunta).
 */
export function SlotEditorModal({
  dayLabel,
  start,
  end,
  allowsHome,
  allowsOnline,
  homeMax,
  onlineMax,
  liveError,
  onStartChange,
  onEndChange,
  onAllowsHomeChange,
  onAllowsOnlineChange,
  onHomeMaxChange,
  onOnlineMaxChange,
  onSave,
  onCancel,
  onDelete,
  hasUpcomingBooking,
  isNew,
  canRepeatForMonth,
  repeatForMonth,
  onRepeatForMonthChange,
  repeatWeekdayLabel,
  repeatMonthLabel,
}: {
  dayLabel: string;
  start: string;
  end: string;
  /** Due caselle indipendenti (richiesta esplicita dell'utente), almeno una obbligatoria per salvare. */
  allowsHome: boolean;
  allowsOnline: boolean;
  homeMax: string;
  onlineMax: string;
  /** Calcolato ad ogni render da slotEditorLiveError: mostrato subito, senza aspettare "Salva agenda". */
  liveError: string | null;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onAllowsHomeChange: (v: boolean) => void;
  onAllowsOnlineChange: (v: boolean) => void;
  onHomeMaxChange: (v: string) => void;
  onOnlineMaxChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Assente quando si sta creando una fascia nuova: solo una fascia già esistente si può eliminare. */
  onDelete?: () => void;
  /** Richiede una seconda conferma prima di eliminare, stesso pattern a due passaggi già in uso altrove nel progetto. */
  hasUpcomingBooking: boolean;
  /** True mentre si crea una fascia nuova: cambia solo l'etichetta della spunta ("Ripeti" vs "Applica anche"). */
  isNew: boolean;
  /** False per una fascia ricorrente storica (nessuna data esatta, niente mese su cui scoping ha senso). */
  canRepeatForMonth: boolean;
  repeatForMonth: boolean;
  onRepeatForMonthChange: (v: boolean) => void;
  repeatWeekdayLabel: string;
  repeatMonthLabel: string;
}) {
  // Eliminazione dal pop-up invece che da un tasto "×" sulla fascia: su
  // cellulare quella "×" si sovrapponeva al riquadro della fascia, poco
  // chiara — richiesta esplicita dell'utente.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Imposta fascia oraria"
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
        maxWidth={400}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {dayLabel}
          </Text>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onCancel} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <YStack gap="$2">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Orario
          </Text>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <input type="time" value={start} onChange={(e) => onStartChange(e.target.value)} style={modalTimeInputStyle} />
            <Text fontSize="$3" color={brand.grafite70}>
              –
            </Text>
            <input type="time" value={end} onChange={(e) => onEndChange(e.target.value)} style={modalTimeInputStyle} />
          </XStack>
        </YStack>

        <YStack gap="$3">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Modalità (almeno una obbligatoria)
          </Text>
          {/* Due caselle indipendenti, richiesta esplicita dell'utente: "a
              domicilio"/"online", ognuna con la propria capienza massima —
              un professionista può offrire, ad esempio, 2 interventi a
              domicilio E 5 consulenze online sulla stessa fascia oraria. */}
          <YStack gap="$2">
            <XStack
              alignItems="center"
              gap="$3"
              padding="$3"
              backgroundColor={brand.gesso}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$3"
              cursor="pointer"
              onPress={() => onAllowsHomeChange(!allowsHome)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allowsHome }}
            >
              <YStack
                width={22}
                height={22}
                borderRadius="$2"
                borderWidth={2}
                borderColor={allowsHome ? brand.cianografia : brand.filetto}
                backgroundColor={allowsHome ? brand.cianografia : brand.calce}
                alignItems="center"
                justifyContent="center"
              >
                {allowsHome ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
              </YStack>
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                A domicilio
              </Text>
              {allowsHome ? (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={homeMax}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onHomeMaxChange(e.target.value)}
                  style={modalMaxInputStyle}
                />
              ) : null}
            </XStack>
            <XStack
              alignItems="center"
              gap="$3"
              padding="$3"
              backgroundColor={brand.gesso}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$3"
              cursor="pointer"
              onPress={() => onAllowsOnlineChange(!allowsOnline)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allowsOnline }}
            >
              <YStack
                width={22}
                height={22}
                borderRadius="$2"
                borderWidth={2}
                borderColor={allowsOnline ? brand.cianografia : brand.filetto}
                backgroundColor={allowsOnline ? brand.cianografia : brand.calce}
                alignItems="center"
                justifyContent="center"
              >
                {allowsOnline ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
              </YStack>
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                Online
              </Text>
              {allowsOnline ? (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={onlineMax}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onOnlineMaxChange(e.target.value)}
                  style={modalMaxInputStyle}
                />
              ) : null}
            </XStack>
          </YStack>
        </YStack>

        {canRepeatForMonth ? (
          <XStack
            alignItems="center"
            gap="$3"
            padding="$3"
            backgroundColor={brand.gesso}
            borderWidth={1}
            borderColor={brand.filetto}
            borderRadius="$3"
            cursor="pointer"
            onPress={() => onRepeatForMonthChange(!repeatForMonth)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: repeatForMonth }}
          >
            <YStack
              width={22}
              height={22}
              borderRadius="$2"
              borderWidth={2}
              borderColor={repeatForMonth ? brand.cianografia : brand.filetto}
              backgroundColor={repeatForMonth ? brand.cianografia : brand.calce}
              alignItems="center"
              justifyContent="center"
            >
              {repeatForMonth ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
            </YStack>
            {/* Creando una fascia nuova, la spunta ne aggiunge una per ogni
                occorrenza del mese; modificandone una esistente (es. cambiando
                la capienza), propaga invece lo stesso orario/capienza alle
                fasce gemelle del mese — senza spunta, la modifica resta
                sempre limitata a questo solo giorno (richiesta esplicita
                dell'utente). */}
            <Text flex={1} fontSize="$3" color={brand.grafite}>
              {isNew
                ? `Ripeti per tutti i ${repeatWeekdayLabel.toLowerCase()} di ${repeatMonthLabel.toLowerCase()}`
                : `Applica anche a tutti i ${repeatWeekdayLabel.toLowerCase()} di ${repeatMonthLabel.toLowerCase()}`}
            </Text>
          </XStack>
        ) : null}
        {!isNew ? (
          <Text fontSize="$2" color={brand.grafite70}>
            {canRepeatForMonth
              ? "Senza spunta, la modifica riguarda solo questo giorno."
              : "Questa fascia è ricorrente: la modifica si applica a ogni occorrenza futura."}
          </Text>
        ) : null}

        {liveError ? (
          <XStack borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo} borderRadius="$2" paddingHorizontal="$3" paddingVertical="$2" gap="$2" alignItems="center">
            <Icon name="bell-ring" size={14} color={brand.urgenza} />
            <Text color={brand.urgenza} fontSize="$3" fontWeight="600" flex={1}>
              {liveError}
            </Text>
          </XStack>
        ) : null}

        <XStack gap="$3">
          <Button variant="primary" disabled={!!liveError} opacity={liveError ? 0.5 : 1} onPress={liveError ? undefined : onSave}>
            Salva
          </Button>
          <Button variant="ghost" onPress={onCancel}>
            Annulla
          </Button>
        </XStack>

        {onDelete ? (
          <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
            {confirmingDelete ? (
              <YStack gap="$2">
                {hasUpcomingBooking ? (
                  <XStack
                    borderWidth={1}
                    borderColor={brand.urgenza}
                    backgroundColor={brand.urgenzaVelo}
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    gap="$2"
                    alignItems="center"
                  >
                    <Icon name="bell-ring" size={14} color={brand.urgenza} />
                    <Text color={brand.urgenza} fontSize="$3" fontWeight="600" flex={1}>
                      Questa fascia ha una prenotazione futura. Eliminarla comunque?
                    </Text>
                  </XStack>
                ) : (
                  <Text color={brand.grafite70} fontSize="$3">
                    Eliminare questa fascia?
                  </Text>
                )}
                <XStack gap="$3">
                  <Button variant="urgent" onPress={onDelete}>
                    Conferma eliminazione
                  </Button>
                  <Button variant="ghost" onPress={() => setConfirmingDelete(false)}>
                    Annulla
                  </Button>
                </XStack>
              </YStack>
            ) : (
              <Text
                fontSize="$3"
                fontWeight="700"
                color={brand.urgenza}
                cursor="pointer"
                onPress={() => setConfirmingDelete(true)}
                accessibilityRole="button"
                accessibilityLabel="Elimina fascia"
              >
                Elimina fascia
              </Text>
            )}
          </YStack>
        ) : null}
      </YStack>
    </div>
  );
}
