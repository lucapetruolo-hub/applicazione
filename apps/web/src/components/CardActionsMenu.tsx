"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Icon,
  Text,
  XStack,
  YStack,
  brand,
  radiusDoc,
  type IconName,
} from "@professionisti/ui";

/**
 * Menu hamburger delle azioni di una scheda richiesta — condiviso da
 * `/le-mie-richieste` (lato cliente) e `/dashboard/richieste` (lato
 * professionista), richiesta esplicita dell'utente: "un pulsante hamburger
 * in alto a destra che non vada in conflitto con la riga dei badge
 * (Urgente/Scaduta/A domicilio/Online), quindi sotto di loro". Il
 * posizionamento (riga del titolo, non riga dei badge) lo decide chi lo
 * usa; qui solo il pulsante e la tendina.
 *
 * La tendina è renderizzata in un portal su `document.body` con posizione
 * fissa calcolata dal pulsante: le schede (`Surface`) hanno
 * `overflow="hidden"` e la tagliavano a metà.
 *
 * Un'azione distruttiva può chiedere conferma dentro la tendina stessa
 * (`confirm`), senza aprire un modale a sé: stesso vincolo già presente
 * per "Annulla richiesta" prima di questo menu condiviso (il popup di
 * conferma deve comparire subito sotto al pulsante).
 */
export type CardAction = {
  icon: IconName;
  text: string;
  /** "danger" → testo/icona rossi (annulla, elimina, rifiuta). */
  tone?: "default" | "danger";
  onPress: () => void | Promise<void>;
  /** Se presente, il click mostra prima una domanda di conferma nella tendina. */
  confirm?: { question: string; confirmLabel: string; busyLabel: string };
};

export function CardActionsMenu({
  accessibilityLabel,
  actions,
}: {
  accessibilityLabel: string;
  actions: CardAction[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirming, setConfirming] = useState<CardAction | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Aperta verso il basso (`top`) o verso l'alto (`bottom`) a seconda dello
  // spazio disponibile: su telefono con molte voci la tendina finiva sotto
  // il bordo dello schermo, con le ultime azioni irraggiungibili.
  const [anchor, setAnchor] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      setIsOpen(false);
      setConfirming(null);
    }
    // Posizione fissa: allo scroll/resize la tendina resterebbe staccata
    // dal pulsante, più semplice chiuderla.
    function handleViewportChange(event: Event) {
      // Lo scroll interno della tendina stessa non la deve chiudere.
      if (
        event.type === "scroll" &&
        event.target instanceof Node &&
        dropdownRef.current?.contains(event.target)
      )
        return;
      setIsOpen(false);
      setConfirming(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [isOpen]);

  function open() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const right = Math.max(8, window.innerWidth - rect.right);
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    if (spaceBelow < 320 && spaceAbove > spaceBelow) {
      setAnchor({
        bottom: window.innerHeight - rect.top + 8,
        right,
        maxHeight: spaceAbove,
      });
    } else {
      setAnchor({ top: rect.bottom + 8, right, maxHeight: spaceBelow });
    }
    setIsOpen(true);
  }

  if (actions.length === 0) return null;

  function close() {
    setIsOpen(false);
    setConfirming(null);
  }

  async function runConfirmed(action: CardAction) {
    setIsBusy(true);
    try {
      await action.onPress();
    } finally {
      setIsBusy(false);
      close();
    }
  }

  return (
    <YStack flexShrink={0}>
      <YStack
        ref={buttonRef}
        width={36}
        height={36}
        borderRadius={999}
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        borderWidth={1}
        borderColor={isOpen ? brand.filetto : "transparent"}
        backgroundColor={isOpen ? brand.gesso : "transparent"}
        hoverStyle={{ backgroundColor: brand.gesso }}
        onPress={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          if (isOpen) close();
          else open();
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon name="menu" size={18} color={brand.grafite} />
      </YStack>

      {/* `position: fixed` non è tipizzato per Tamagui (stesso limite già
          documentato in ToastStack.tsx): `<div>` grezzo come contenitore.
          Lo stopPropagation serve perché gli eventi React risalgono anche
          attraverso un portal: senza, un click nella tendina aprirebbe/
          chiuderebbe la scheda sottostante. */}
      {isOpen && anchor
        ? createPortal(
            <div
              ref={dropdownRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: anchor.top,
                bottom: anchor.bottom,
                right: anchor.right,
                maxHeight: anchor.maxHeight,
                overflowY: "auto",
                borderRadius: radiusDoc,
                maxWidth: "calc(100vw - 16px)",
                zIndex: 5000,
              }}
            >
              <YStack
                minWidth={confirming ? 250 : 220}
                backgroundColor={brand.calce}
                borderRadius={radiusDoc}
                borderWidth={1}
                borderColor={brand.filetto}
                overflow="hidden"
                shadowColor="rgba(43,32,19,0.12)"
                shadowRadius={12}
                shadowOffset={{ width: 0, height: 4 }}
                shadowOpacity={1}
              >
                {confirming?.confirm ? (
                  <YStack padding="$3" gap="$2">
                    <Text fontSize="$2" color={brand.grafite}>
                      {confirming.confirm.question}
                    </Text>
                    <XStack gap="$2">
                      <Button
                        variant="urgent"
                        size="$2"
                        height={34}
                        onPress={(e: { stopPropagation: () => void }) => {
                          e.stopPropagation();
                          runConfirmed(confirming);
                        }}
                        disabled={isBusy}
                        opacity={isBusy ? 0.6 : 1}
                      >
                        {isBusy
                          ? confirming.confirm.busyLabel
                          : confirming.confirm.confirmLabel}
                      </Button>
                      <Button
                        variant="ghost"
                        size="$2"
                        height={34}
                        onPress={(e: { stopPropagation: () => void }) => {
                          e.stopPropagation();
                          setConfirming(null);
                        }}
                      >
                        Indietro
                      </Button>
                    </XStack>
                  </YStack>
                ) : (
                  actions.map((action) => {
                    const color =
                      action.tone === "danger" ? brand.urgenza : brand.grafite;
                    return (
                      <XStack
                        key={action.text}
                        paddingHorizontal="$4"
                        paddingVertical="$3"
                        alignItems="center"
                        gap="$2"
                        cursor="pointer"
                        hoverStyle={{ backgroundColor: brand.gesso }}
                        onPress={(e: { stopPropagation: () => void }) => {
                          e.stopPropagation();
                          if (action.confirm) {
                            setConfirming(action);
                            return;
                          }
                          close();
                          action.onPress();
                        }}
                        accessibilityRole="button"
                      >
                        <Icon name={action.icon} size={16} color={color} />
                        <Text fontSize="$3" color={color} fontWeight="600">
                          {action.text}
                        </Text>
                      </XStack>
                    );
                  })
                )}
              </YStack>
            </div>,
            document.body,
          )
        : null}
    </YStack>
  );
}
