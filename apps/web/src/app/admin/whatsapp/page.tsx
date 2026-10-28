"use client";

import { useEffect, useState } from "react";
import type { WhatsAppAdminSummary } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import {
  AdminPageHeader,
  AdminPill,
  errorMessage,
  formatAdminDate,
} from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Admin → WhatsApp (docs/changelog/2026-10-28-promemoria-whatsapp.md):
 * quanti messaggi, quanto costano, perché alcuni non partono, e il numero
 * che dice se servono: lavori saltati con e senza il promemoria.
 */
const TYPE_LABEL: Record<string, string> = {
  BOOKING_REMINDER_CLIENT: "Promemoria al cliente",
  BOOKING_REMINDER_PROFESSIONAL: "Promemoria al professionista",
  PROFESSIONAL_ON_THE_WAY: "Sto arrivando",
  BOOKING_CANCELED: "Appuntamento annullato",
  PHONE_VERIFICATION_CODE: "Codice del numero",
};

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "In attesa",
  SENT: "Partito",
  DELIVERED: "Consegnato",
  READ: "Letto",
  FAILED: "Non consegnato",
  SKIPPED: "Non mandato",
};

const SKIP_LABEL: Record<string, string> = {
  OPTED_OUT: "Promemoria spenti",
  NOT_VERIFIED: "Numero non confermato",
  NOT_MOBILE: "Numero fisso",
  NO_PHONE: "Senza numero",
  PHONE_CHANGED: "Numero cambiato",
  EXPIRED: "Arrivato troppo tardi",
  DAILY_LIMIT: "Tetto del giorno del sito",
  USER_DAILY_LIMIT: "Tetto del giorno per persona",
  ACCOUNT_DELETED: "Account eliminato",
  INVALID: "Dati non validi",
};

function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminWhatsAppPage() {
  const { token } = useAuth();
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<WhatsAppAdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminWhatsApp(token, month)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token, month]);

  const total = data
    ? Object.values(data.byStatus).reduce((a, b) => a + b, 0)
    : 0;
  const delivered = data
    ? (data.byStatus.DELIVERED ?? 0) + (data.byStatus.READ ?? 0)
    : 0;
  const effect = data?.reminderEffect;

  return (
    <YStack gap="$5">
      <AdminPageHeader
        title="WhatsApp"
        description="Promemoria degli appuntamenti: messaggi, costo e lavori saltati con e senza promemoria."
        right={
          <input
            type="month"
            className="admin-input"
            value={month}
            max={currentMonth()}
            onChange={(e) => {
              if (!e.target.value) return;
              setData(null);
              setError(null);
              setMonth(e.target.value);
            }}
            aria-label="Mese"
          />
        }
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data && !data.available ? (
        <Text fontSize={16} color={brand.grafite70}>
          Spento: mancano le chiavi di Meta su Render (WHATSAPP_ACCESS_TOKEN e
          WHATSAPP_PHONE_NUMBER_ID). Nessun messaggio parte.
        </Text>
      ) : null}

      {!data && !error ? (
        <SkeletonTableRows rows={3} cols={4} />
      ) : data ? (
        <>
          <div className="admin-kpi-grid">
            <div className="admin-kpi">
              <span className="admin-kpi-value">{euro(data.costEurCents)}</span>
              <span className="admin-kpi-label">Costo stimato del mese</span>
            </div>
            <div className="admin-kpi">
              <span className="admin-kpi-value">{delivered}</span>
              <span className="admin-kpi-label">
                Consegnati ·{" "}
                {percent(delivered, total - (data.byStatus.SKIPPED ?? 0))} di
                quelli partiti
              </span>
            </div>
            <div
              className={`admin-kpi${(data.byStatus.FAILED ?? 0) > 0 ? " is-urgent" : ""}`}
            >
              <span className="admin-kpi-value">
                {data.byStatus.FAILED ?? 0}
              </span>
              <span className="admin-kpi-label">Non consegnati</span>
            </div>
            <div className="admin-kpi">
              <span className="admin-kpi-value">
                {data.sentToday}/{data.dailyLimit}
              </span>
              <span className="admin-kpi-label">
                Partiti oggi sul tetto del giorno
              </span>
            </div>
            <div className="admin-kpi">
              <span className="admin-kpi-value">{data.optedInUsers}</span>
              <span className="admin-kpi-label">
                Persone con i promemoria accesi
              </span>
            </div>
          </div>

          {effect ? (
            <YStack gap="$2">
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize="$5"
                color={brand.grafite}
              >
                Servono?
              </Text>
              <Text fontSize={14} color={brand.grafite70}>
                Lavori passati dal {formatAdminDate(effect.since)} (ultimi 90
                giorni, senza account di prova). Saltati: cliente assente o
                annullato all&apos;ultimo dal cliente.
              </Text>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Lavori</th>
                      <th>Saltati</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Con il promemoria WhatsApp consegnato</td>
                      <td>{effect.withReminder.jobs}</td>
                      <td>
                        {effect.withReminder.missed} ·{" "}
                        {percent(
                          effect.withReminder.missed,
                          effect.withReminder.jobs,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>Senza (solo email)</td>
                      <td>{effect.withoutReminder.jobs}</td>
                      <td>
                        {effect.withoutReminder.missed} ·{" "}
                        {percent(
                          effect.withoutReminder.missed,
                          effect.withoutReminder.jobs,
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </YStack>
          ) : null}

          <YStack gap="$2">
            <Text
              fontFamily="$heading"
              fontWeight="700"
              fontSize="$5"
              color={brand.grafite}
            >
              Per tipo
            </Text>
            {data.byType.length === 0 ? (
              <Text color={brand.grafite70}>
                Nessun messaggio in questo mese.
              </Text>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Messaggio</th>
                      <th>Esito</th>
                      <th>Quanti</th>
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byType.map((row) => (
                      <tr key={`${row.type}-${row.status}`}>
                        <td>{TYPE_LABEL[row.type] ?? row.type}</td>
                        <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                        <td>{row.count}</td>
                        <td>{euro(row.costEurCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </YStack>

          {data.skipped.length > 0 ? (
            <YStack gap="$2">
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize="$5"
                color={brand.grafite}
              >
                Perché non sono partiti
              </Text>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <tbody>
                    {data.skipped.map((row) => (
                      <tr key={row.reason}>
                        <td>{SKIP_LABEL[row.reason] ?? row.reason}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </YStack>
          ) : null}

          {data.recent.length > 0 ? (
            <YStack gap="$2">
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize="$5"
                color={brand.grafite}
              >
                Ultimi messaggi
              </Text>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Creato</th>
                      <th>Messaggio</th>
                      <th>A</th>
                      <th>Esito</th>
                      <th>Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <tr key={row.id}>
                        <td>{formatAdminDate(row.createdAt, true)}</td>
                        <td>{TYPE_LABEL[row.type] ?? row.type}</td>
                        <td>
                          {row.role === "PROFESSIONAL"
                            ? "Professionista"
                            : row.role
                              ? "Cliente"
                              : "—"}
                        </td>
                        <td>
                          <AdminPill
                            tone={
                              row.status === "FAILED"
                                ? "danger"
                                : row.status === "DELIVERED" ||
                                    row.status === "READ"
                                  ? "ok"
                                  : row.status === "SKIPPED"
                                    ? "neutral"
                                    : "warn"
                            }
                          >
                            {STATUS_LABEL[row.status] ?? row.status}
                          </AdminPill>
                          {row.skipReason ? (
                            <small>
                              {" "}
                              {SKIP_LABEL[row.skipReason] ?? row.skipReason}
                            </small>
                          ) : null}
                          {row.error ? (
                            <>
                              <br />
                              <small>{row.error}</small>
                            </>
                          ) : null}
                        </td>
                        <td>{euro(row.costEurCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </YStack>
          ) : null}
        </>
      ) : null}
    </YStack>
  );
}
