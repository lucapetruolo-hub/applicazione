"use client";

import type { ReactNode } from "react";
import { Button, Text, XStack, brand } from "@professionisti/ui";

/**
 * Riga "Salva" in fondo ai moduli lunghi (Account del cliente, Modifica
 * profilo del professionista). Appena cambi qualcosa resta attaccata al
 * fondo dello schermo con "Modifiche non salvate" (docs/CHANGELOG.md §349):
 * chi correggeva un campo in alto non vedeva il pulsante, 2.500 px più giù,
 * e usciva perdendo le modifiche.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onCancel,
  saveLabel = "Salva",
  children,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  /** Riga sopra i pulsanti (es. la dichiarazione del profilo), solo nella posizione normale. */
  children?: ReactNode;
}) {
  return (
    <div className={`save-bar${dirty ? " is-dirty" : ""}`}>
      {children}
      <XStack gap="$3" alignItems="center" flexWrap="wrap" justifyContent={dirty ? "space-between" : "flex-start"}>
        {dirty ? (
          <Text fontSize={16} fontWeight="700" color={brand.grafite} role="status">
            Modifiche non salvate
          </Text>
        ) : null}
        <XStack gap="$3" alignItems="center" marginLeft={dirty ? "auto" : 0}>
          {onCancel && dirty ? (
            <Button variant="secondary" onPress={onCancel} disabled={saving}>
              Annulla
            </Button>
          ) : null}
          <Button variant="primary" onPress={onSave} disabled={saving} opacity={saving ? 0.6 : 1}>
            {saving ? "Salvataggio..." : saveLabel}
          </Button>
        </XStack>
      </XStack>
    </div>
  );
}
