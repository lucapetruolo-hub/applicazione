"use client";

import { useState } from "react";
import type { AdminNotificationOptOutGroup } from "@professionisti/api-client";
import { Surface, Text, YStack, brand } from "@professionisti/ui";

const ROLE_LABEL = { professional: "Professionisti", client: "Clienti" } as const;

/**
 * "Avvisi spenti" (Admin → Statistiche,
 * docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md): quante
 * persone spengono ogni avviso. Se uno lo spengono in tanti, forse arriva
 * troppo spesso o non serve: è il segnale per cambiarlo.
 */
export function NotificationOptOutsPanel({ data }: { data: AdminNotificationOptOutGroup[] }) {
  const [role, setRole] = useState<"professional" | "client">("professional");
  const group = data.find((candidate) => candidate.role === role);
  if (!group) return null;
  const cell = (count: number) => (group.people > 0 && count > 0 ? `${count} · ${Math.round((count / group.people) * 100)}%` : count > 0 ? String(count) : "—");

  return (
    <Surface padding="$5" gap="$4">
      <YStack gap="$1">
        <Text fontWeight="700" fontSize={17}>
          Avvisi spenti
        </Text>
        <Text fontSize={12} color={brand.grafite70}>
          Quante persone hanno spento ogni avviso, senza gli account di prova. Un avviso spento da tanti forse arriva troppo spesso.
        </Text>
      </YStack>
      <div className="optout-tabs" role="group" aria-label="Chi">
        {(["professional", "client"] as const).map((key) => {
          const people = data.find((candidate) => candidate.role === key)?.people ?? 0;
          return (
            <button key={key} type="button" aria-pressed={role === key} className={role === key ? "is-on" : undefined} onClick={() => setRole(key)}>
              {ROLE_LABEL[key]} <small>{people}</small>
            </button>
          );
        })}
      </div>
      <div className="optout-wrap">
        <table className="optout-table">
          <thead>
            <tr>
              <th scope="col">Avviso</th>
              <th scope="col">Sito spento</th>
              <th scope="col">Email spenta</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={row.key} className={row.level === "topic" ? "is-topic" : undefined}>
                <th scope="row">{row.label}</th>
                <td>{row.hasSite ? cell(row.siteOff) : <span className="optout-na">solo email</span>}</td>
                <td>
                  {!row.hasEmail ? (
                    <span className="optout-na">solo sito</span>
                  ) : row.emailOffByDefault ? (
                    <span className="optout-na">spenta di serie{row.emailOn > 0 ? `, accesa da ${row.emailOn}` : ""}</span>
                  ) : (
                    cell(row.emailOff)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text fontSize={13} color={brand.grafite70}>
        Riassunto della sera spento: <strong>{cell(group.digestOff)}</strong> · Email anche di notte: <strong>{cell(group.quietNightOff)}</strong>
        {group.role === "professional" ? (
          <>
            {" "}
            · Urgenti anche di notte: <strong>{cell(group.urgentAtNight)}</strong>
          </>
        ) : null}
      </Text>
    </Surface>
  );
}
