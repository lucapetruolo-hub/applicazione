"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { arrivalWindowText, jobDayCount, wallClockToday, type ProfessionalBooking } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { ItalianTimeInput } from "@/components/ItalianTimeInput";
import styles from "./ArrivalTimesNotice.module.css";

// Fascia lunga: da tre ore in su, come il campo del preventivo.
const LONG_BAND_MINUTES = 180;

type Band = { key: string; start: string; end: string; bookings: ProfessionalBooking[] };

/**
 * Lavori di domani nella stessa fascia lunga senza ora di arrivo: "Dì ai
 * clienti verso che ora passi", un campo per ognuno (scelta di Luca,
 * docs/changelog/2026-11-11-fasce-ampie.md). Chi sa l'ora non aspetta il
 * professionista tutto il giorno.
 */
export function tomorrowBandsWithoutArrival(bookings: ProfessionalBooking[], now: Date = new Date()): Band[] {
  const tomorrow = new Date(wallClockToday(now).getTime() + 86_400_000).toISOString().slice(0, 10);
  const groups = new Map<string, ProfessionalBooking[]>();
  for (const booking of bookings) {
    if (booking.status !== "CONFIRMED" && booking.status !== "PENDING") continue;
    if (!booking.scheduledEndAt || booking.scheduledAt.slice(0, 10) !== tomorrow) continue;
    if (jobDayCount(booking.scheduledAt, booking.scheduledEndAt) !== 1) continue;
    if (Date.parse(booking.scheduledEndAt) - Date.parse(booking.scheduledAt) < LONG_BAND_MINUTES * 60_000) continue;
    const key = `${booking.scheduledAt}|${booking.scheduledEndAt}`;
    groups.set(key, [...(groups.get(key) ?? []), booking]);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= 2 && list.some((b) => !b.arrivalTime))
    .map(([key, list]) => ({ key, start: list[0]!.scheduledAt.slice(11, 16), end: list[0]!.scheduledEndAt!.slice(11, 16), bookings: list }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function ArrivalTimesNotice({ token, bands, onSaved }: { token: string; bands: Band[]; onSaved: (bookingId: string, arrivalTime: string) => void }) {
  // Le fasce restano in vista finché il professionista non ha finito, anche quando
  // le ore salvate le toglierebbero dall'elenco.
  const [shown, setShown] = useState(bands);
  if (shown.length === 0 && bands.length > 0) setShown(bands);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (shown.length === 0) return null;

  async function save() {
    setError(null);
    const changes: { booking: ProfessionalBooking; time: string }[] = [];
    for (const band of shown) {
      for (const booking of band.bookings) {
        const time = values[booking.id] ?? booking.arrivalTime ?? "";
        if (!time || time === booking.arrivalTime) continue;
        if (!/^\d{2}:\d{2}$/.test(time) || time < band.start || time >= band.end) {
          setError(`Per ${booking.clientName ?? "il cliente"} scegli un'ora tra le ${band.start} e le ${band.end}.`);
          return;
        }
        changes.push({ booking, time });
      }
    }
    if (changes.length === 0) {
      setError("Scrivi almeno un'ora di arrivo.");
      return;
    }
    setSaving(true);
    try {
      for (const { booking, time } of changes) {
        await apiClient.updateBookingArrivalTime(token, booking.id, time);
        onSaved(booking.id, time);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non siamo riusciti a salvare, riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="arrival-times-title">
      <h2 id="arrival-times-title" className={styles.title}>
        <Clock size={18} aria-hidden /> Dì ai clienti di domani verso che ora passi
      </h2>
      {done ? (
        <p className={styles.done} role="status">
          Fatto: i clienti hanno ricevuto l&apos;ora di arrivo.
        </p>
      ) : (
        <>
          <p className={styles.text}>Così non ti aspettano tutto il giorno. Ricevono &quot;Arrivo tra le … e le …&quot;, un&apos;ora dall&apos;orario che scrivi.</p>
          {shown.map((band) => (
            <div key={band.key} className={styles.band}>
              <span className={styles.bandHead}>
                Fascia {band.start}–{band.end} · {band.bookings.length} lavori
              </span>
              {band.bookings.map((booking) => {
                const value = values[booking.id] ?? booking.arrivalTime ?? "";
                return (
                  <div key={booking.id} className={styles.row}>
                    <span className={styles.who}>
                      <strong>{booking.clientName ?? "Cliente"}</strong>
                      <span>{[booking.city, booking.items[0]?.name].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ItalianTimeInput
                      ariaLabel={`Ora di arrivo da ${booking.clientName ?? "cliente"}`}
                      value={value}
                      onChange={(next) => setValues((prev) => ({ ...prev, [booking.id]: next }))}
                      style={{ width: 104 }}
                      padX={10}
                    />
                    {/^\d{2}:\d{2}$/.test(value) ? <span className={styles.preview}>{arrivalWindowText(value, booking.scheduledAt, booking.scheduledEndAt)}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className={styles.save} disabled={saving} onClick={() => void save()}>
            {saving ? "Invio..." : "Avvisa i clienti"}
          </button>
        </>
      )}
    </section>
  );
}
