"use client";

import { useEffect, useState } from "react";
import { Icon, Text, XStack, brand } from "@professionisti/ui";

const DELETED_EVENT = "request-deleted";

/** Da chiamare dopo aver eliminato una richiesta: la sua scheda sparisce subito, la conferma resta nella pagina. */
export function announceRequestDeleted() {
  window.dispatchEvent(new Event(DELETED_EVENT));
}

/**
 * "Richiesta eliminata" per qualche secondo in basso (docs/CHANGELOG.md
 * §337): fissa allo schermo e non in cima all'elenco, perché chi elimina
 * può essere molto più in basso nella pagina.
 */
export function RequestDeletedNotice() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function handle() {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 4000);
    }
    window.addEventListener(DELETED_EVENT, handle);
    return () => {
      window.removeEventListener(DELETED_EVENT, handle);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ position: "fixed", left: 16, right: 16, bottom: 24, zIndex: 1100, display: "flex", justifyContent: "center", pointerEvents: "none" }}
    >
      {visible ? (
        <XStack alignItems="center" gap="$2" backgroundColor={brand.grafite} borderRadius="$3" paddingVertical="$3" paddingHorizontal="$4" maxWidth={420}>
          <Icon name="check" size={16} color="white" strokeWidth={2.5} />
          <Text fontSize={16} fontWeight="600" color="white">
            Richiesta eliminata
          </Text>
        </XStack>
      ) : null}
    </div>
  );
}
