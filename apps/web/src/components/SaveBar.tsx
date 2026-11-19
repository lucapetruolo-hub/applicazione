"use client";

import type { ReactNode } from "react";
import { Button, Text, XStack, brand } from "@professionisti/ui";
import { ButtonWaitBar } from "@/components/WaitBar";

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
  error,
  onErrorPress,
  children,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  /** Riga sopra i pulsanti (es. la dichiarazione del profilo), solo nella posizione normale. */
  children?: ReactNode;
  /**
   * Errore del salvataggio, sopra il pulsante anche quando la riga resta in
   * fondo allo schermo: prima stava in fondo alla pagina e chi premeva
   * "Salva" in alto non lo vedeva.
   */
  error?: string | null;
  /** Con questo l'errore si tocca e porta al campo da sistemare (docs/changelog/2026-11-19-campi-obbligatori-profilo.md). */
  onErrorPress?: () => void;
}) {
  return (
    <div className={`save-bar${dirty ? " is-dirty" : ""}`}>
      {children}
      {/* Letto dal lettore di schermo senza spostare il fuoco (collaudo L-07). */}
      <div role="alert" className="save-bar-error">
        {error ? (
          onErrorPress ? (
            <button type="button" className="save-bar-error-link" onClick={onErrorPress}>
              <span>{error}</span> <span className="save-bar-error-go">Vai al campo</span>
            </button>
          ) : (
            <span>{error}</span>
          )
        ) : null}
      </div>
      <XStack gap="3" alignItems="center" flexWrap="wrap" justifyContent={dirty ? "space-between" : "flex-start"}>
        {dirty ? (
          <Text fontSize={16} fontWeight="700" color={brand.grafite} role="status">
            Modifiche non salvate
          </Text>
        ) : null}
        <XStack gap="3" alignItems="center" marginLeft={dirty ? "auto" : 0}>
          {onCancel && dirty ? (
            <Button variant="secondary" onPress={onCancel} disabled={saving}>
              Annulla
            </Button>
          ) : null}
          <Button variant="primary" onPress={onSave} disabled={saving}>
            {saveLabel}
            {saving ? <ButtonWaitBar label="Salvataggio…" /> : null}
          </Button>
        </XStack>
      </XStack>
    </div>
  );
}
