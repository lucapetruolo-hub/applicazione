"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { arrivalTimeChoices, arrivalWindowText, arrivalWord, jobDayCount, wallClockToday, type ProfessionalBooking } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
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

  // Online il professionista non passa, contatta (docs/changelog/2026-11-26-ore-gia-date-in-oggi.md).
  const all = shown.flatMap((band) => band.bookings);
  const online = all.filter((b) => b.serviceMode === "ONLINE").length;
  const verb = online === 0 ? "passi" : online === all.length ? "li contatti" : "passi o li contatti";
  const sample = online === 0 ? '"Arrivo tra le … e le …"' : online === all.length ? '"Ti contatta tra le … e le …"' : '"Arrivo tra le … e le …" (online "Ti contatta")';
  /** Ora scelta per gli altri clienti della stessa fascia: chi l'ha già, per il pallino. */
  const takenBy = (band: Band, bookingId: string) => {
    const taken = new Map<string, string>();
    for (const other of band.bookings) {
      if (other.id === bookingId) continue;
      const time = values[other.id] ?? other.arrivalTime ?? "";
      if (time && !taken.has(time)) taken.set(time, other.clientName ?? "un altro cliente");
    }
    return taken;
  };
  const anyTaken = shown.some((band) => band.bookings.some((b) => takenBy(band, b.id).size > 0));

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
      setError("Scegli almeno un'ora di arrivo.");
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
        <Clock size={18} aria-hidden /> Dì ai clienti di domani verso che ora {verb}
      </h2>
      {done ? (
        <p className={styles.done} role="status">
          Fatto: i clienti hanno ricevuto l&apos;ora di arrivo.
        </p>
      ) : (
        <>
          <p className={styles.text}>Così non ti aspettano tutto il giorno. Ricevono {sample}, un&apos;ora dall&apos;orario che scegli.</p>
          {anyTaken ? (
            <p className={styles.legend}>
              <span className="week-slots-dot" aria-hidden /> Ora già data a un altro cliente della stessa fascia
            </p>
          ) : null}
          {shown.map((band) => (
            <div key={band.key} className={styles.band}>
              <span className={styles.bandHead}>
                Fascia {band.start}–{band.end} · {band.bookings.length} lavori
              </span>
              {band.bookings.map((booking) => {
                const value = values[booking.id] ?? booking.arrivalTime ?? "";
                const taken = takenBy(band, booking.id);
                return (
                  <div key={booking.id} className={styles.row}>
                    <span className={styles.who}>
                      <strong>{booking.clientName ?? "Cliente"}</strong>
                      <span>{[booking.city, booking.items[0]?.name].filter(Boolean).join(" · ")}</span>
                    </span>
                    {/* Solo gli orari dentro la fascia, uno all'ora (docs/changelog/2026-11-25-orari-di-arrivo-validi.md):
                        come nel preventivo, niente ora sbagliata da correggere dopo. */}
                    <div className={`slot-pills ${styles.pills}`} role="radiogroup" aria-label={`Ora di arrivo da ${booking.clientName ?? "cliente"}`}>
                      {arrivalTimeChoices(band.start, band.end, value).map((time) => (
                        <button
                          key={time}
                          type="button"
                          role="radio"
                          aria-checked={value === time}
                          aria-label={taken.has(time) ? `${time}, già data a ${taken.get(time)}` : time}
                          className={`slot-pill${value === time ? " is-on" : ""}`}
                          onClick={() => setValues((prev) => ({ ...prev, [booking.id]: value === time ? "" : time }))}
                        >
                          {/* Pallino sull'ora già data a un altro cliente: si può scegliere lo stesso, ma lo vedi (docs/changelog/2026-11-26-ore-gia-date-in-oggi.md). */}
                          {taken.has(time) ? <span className="week-slots-dot" aria-hidden /> : null}
                          {time}
                        </button>
                      ))}
                    </div>
                    {/^\d{2}:\d{2}$/.test(value) ? (
                      <span className={styles.preview}>
                        {arrivalWord(booking.serviceMode)} {arrivalWindowText(value, booking.scheduledAt, booking.scheduledEndAt)}
                      </span>
                    ) : null}
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
