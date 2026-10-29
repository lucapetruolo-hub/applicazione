"use client";

import { useState } from "react";
import { PAID_START_MIN_NOTICE_DAYS, type AdminPaidStart } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { AdminCard, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";

function professionals(n: number): string {
  return n === 1 ? "1 professionista" : `${n} professionisti`;
}

/**
 * Abbonamenti a pagamento accesi dall'admin (richiesta di Luca del 29/10/2026,
 * docs/changelog/2026-10-29-abbonamenti-a-pagamento-da-admin.md): spenti,
 * nessun periodo gratuito finisce; accesi da un giorno scelto ad almeno 14
 * giorni, con l'avviso subito a chi è nel periodo gratuito. Ogni scelta
 * chiede una conferma, perché manda un'email a tutti. Solo il super admin
 * la cambia, gli altri la leggono.
 */
export function PaidStartCard({ token, state, canEdit, onChange }: { token: string; state: AdminPaidStart; canEdit: boolean; onChange: (next: AdminPaidStart) => void }) {
  const [day, setDay] = useState(state.earliestDay);
  const [confirm, setConfirm] = useState<"ON" | "OFF" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = state.paidFrom !== null;
  const started = state.started;

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      onChange(await apiClient.adminSetPaidStart(token, next));
      setConfirm(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminCard>
      <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
        <Text fontWeight="700" color={brand.grafite}>
          Abbonamenti a pagamento
        </Text>
        <AdminPill tone={on ? "ok" : "warn"}>{on ? `Accesi dal ${formatAdminDate(state.paidFrom)}` : "Spenti: tutti gratis"}</AdminPill>
      </XStack>
      <Text color={brand.grafite70}>
        {on
          ? started
            ? "Chi non ha scelto un livello alla fine del periodo gratuito va in pausa."
            : `Fino al ${formatAdminDate(state.paidFrom)} resta tutto gratis. I professionisti hanno già ricevuto l'avviso; 3 giorni prima ricevono il promemoria.`
          : `Nessun periodo gratuito finisce, nessuno va in pausa e nessuno paga, finché non li accendi. ${professionals(state.inFreePeriod)} nel periodo gratuito${state.freeOnlyByWaiting > 0 ? `, di cui ${state.freeOnlyByWaiting} con i mesi gratuiti già finiti` : ""}.`}
      </Text>

      {canEdit ? (
        <YStack gap="$2">
          {confirm === null ? (
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              <input
                type="date"
                className="admin-input"
                aria-label="Giorno da cui si paga"
                value={day}
                min={state.earliestDay}
                onChange={(e) => setDay(e.target.value)}
              />
              <Button variant={on ? "secondary" : "primary"} size="$3" disabled={!day || day < state.earliestDay} onPress={() => setConfirm("ON")}>
                {on ? "Cambia il giorno" : "Accendi da questo giorno"}
              </Button>
              {on ? (
                <Button variant="ghost" size="$3" onPress={() => setConfirm("OFF")}>
                  Rispegni
                </Button>
              ) : null}
            </XStack>
          ) : (
            <YStack gap="$2" padding="$3" borderRadius={10} backgroundColor={brand.gesso}>
              <Text color={brand.grafite}>
                {confirm === "ON"
                  ? `Dal ${formatAdminDate(new Date(`${day}T12:00:00`).toISOString())} l'abbonamento diventa a pagamento. ${professionals(state.inFreePeriod)} ricevono subito un'email con la data.`
                  : started
                    ? "Tornano tutti gratis e nessuno va più in pausa. Chi ha già scelto un livello continua a pagarlo finché non lo annulla."
                    : `Resta tutto gratis. ${professionals(state.inFreePeriod)} ricevono subito un'email: la partenza è rimandata.`}
              </Text>
              {on && state.tierChosenInFreePeriod > 0 ? (
                <Text color={brand.grafite70} fontSize={14}>
                  {professionals(state.tierChosenInFreePeriod)} {state.tierChosenInFreePeriod === 1 ? "ha" : "hanno"} già scelto un livello: il primo addebito resta il giorno fissato allora.
                </Text>
              ) : null}
              <XStack gap="$2" flexWrap="wrap">
                <Button variant="primary" size="$3" disabled={saving} onPress={() => void save(confirm === "ON" ? day : null)}>
                  {saving ? "Salvo…" : "Conferma"}
                </Button>
                <Button variant="secondary" size="$3" disabled={saving} onPress={() => setConfirm(null)}>
                  Annulla
                </Button>
              </XStack>
            </YStack>
          )}
          {!on ? (
            <Text fontSize={14} color={brand.grafite70}>
              Il giorno è ad almeno {PAID_START_MIN_NOTICE_DAYS} giorni da oggi, per dare a tutti il tempo di scegliere.
            </Text>
          ) : null}
        </YStack>
      ) : (
        <Text fontSize={14} color={brand.grafite70}>
          Solo il super admin può accenderli o spegnerli.
        </Text>
      )}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
    </AdminCard>
  );
}
