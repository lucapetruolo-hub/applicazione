"use client";

import { useState } from "react";
import { Plus, Video } from "lucide-react";
import { agendaWeekTemplateSchema, type AgendaWeekTemplate, type WeekTemplateSlot } from "@professionisti/shared";
import { SlotEditorModal } from "@/app/dashboard/agenda/_components/SlotEditorModal";
import { WEEKDAY_FULL_LABELS } from "@/app/dashboard/agenda/_components/agendaHelpers";

/** Lunedì per primo, come in tutto il calendario. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const PRESETS: { label: string; slots: WeekTemplateSlot[] }[] = [
  { label: "Mattina 8–13", slots: [{ start: "08:00", end: "13:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null }] },
  { label: "Pomeriggio 14–18", slots: [{ start: "14:00", end: "18:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null }] },
  {
    label: "Mattina e pomeriggio",
    slots: [
      { start: "08:00", end: "13:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null },
      { start: "14:00", end: "18:00", allowsHome: true, allowsOnline: false, homeMax: 1, onlineMax: null },
    ],
  },
];

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function hoursLabel(slots: WeekTemplateSlot[]): string {
  const total = slots.reduce((sum, s) => sum + minutes(s.end) - minutes(s.start), 0);
  if (total === 0) return "Libero";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

type Editing = { day: number; index: number | null; start: string; end: string; allowsHome: boolean; allowsOnline: boolean; homeMax: string; onlineMax: string };

/**
 * Settimana tipo di "Orari di lavoro" (docs/CHANGELOG.md §288): gli orari
 * soliti, giorno per giorno, da applicare a un mese in un tocco. Non vale
 * all'infinito (le fasce dell'agenda sono per data, decisione dell'utente):
 * "Applica" riempie i giorni del mese ancora vuoti e lascia com'erano quelli
 * già impostati a mano.
 */
export function WeekTemplateEditor({
  template,
  onChange,
  months,
  onApply,
  saving,
}: {
  template: AgendaWeekTemplate;
  onChange: (next: AgendaWeekTemplate) => void;
  months: { key: string; label: string }[];
  onApply: (monthKey: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [monthKey, setMonthKey] = useState(months[0]?.key ?? "");

  function setDay(day: number, slots: WeekTemplateSlot[]) {
    const days = template.days.map((s, i) => (i === day ? [...slots].sort((a, b) => a.start.localeCompare(b.start)) : s));
    onChange({ days });
  }

  function openNew(day: number) {
    const last = template.days[day]?.[template.days[day]!.length - 1];
    const start = last ? last.end : "09:00";
    const end = last ? (minutes(last.end) + 120 >= 24 * 60 ? "23:59" : `${String(Math.floor((minutes(last.end) + 120) / 60)).padStart(2, "0")}:${last.end.slice(3)}`) : "13:00";
    setEditing({ day, index: null, start, end, allowsHome: true, allowsOnline: false, homeMax: "1", onlineMax: "1" });
  }

  function openEdit(day: number, index: number) {
    const slot = template.days[day]![index]!;
    setEditing({
      day,
      index,
      start: slot.start,
      end: slot.end,
      allowsHome: slot.allowsHome,
      allowsOnline: slot.allowsOnline,
      homeMax: String(slot.homeMax ?? 1),
      onlineMax: String(slot.onlineMax ?? 1),
    });
  }

  const editingError = (() => {
    if (!editing) return null;
    const clamp = (v: string) => Math.max(1, Math.min(20, Math.round(Number(v)) || 1));
    const slot: WeekTemplateSlot = {
      start: editing.start,
      end: editing.end,
      allowsHome: editing.allowsHome,
      allowsOnline: editing.allowsOnline,
      homeMax: editing.allowsHome ? clamp(editing.homeMax) : null,
      onlineMax: editing.allowsOnline ? clamp(editing.onlineMax) : null,
    };
    const others = template.days[editing.day]!.filter((_, i) => i !== editing.index);
    const parsed = agendaWeekTemplateSchema.safeParse({ days: template.days.map((s, i) => (i === editing.day ? [...others, slot] : s)) });
    if (parsed.success) return { slot, error: null };
    if (editing.end <= editing.start) return { slot, error: "L'orario di fine deve essere dopo l'orario di inizio." };
    if (!editing.allowsHome && !editing.allowsOnline) return { slot, error: "Seleziona almeno una modalità (a domicilio o online)." };
    return { slot, error: "Questa fascia si sovrappone a un'altra dello stesso giorno." };
  })();

  function saveEditing() {
    if (!editing || !editingError || editingError.error) return;
    const others = template.days[editing.day]!.filter((_, i) => i !== editing.index);
    setDay(editing.day, [...others, editingError.slot]);
    setEditing(null);
  }

  return (
    <div className="ag-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 19 }}>Settimana tipo</h2>
        <span className="ag-muted" style={{ fontSize: 13 }} aria-live="polite">
          {saving ? "Salvo..." : "Salvata"}
        </span>
      </div>
      <p className="ag-muted" style={{ fontSize: 13.5, marginTop: 4 }}>
        I tuoi orari soliti, uguali ogni settimana. Applicali a un mese e poi cambia i singoli giorni qui sotto.
      </p>

      <div style={{ marginTop: 6 }}>
        {WEEK_ORDER.map((day) => {
          const slots = template.days[day] ?? [];
          return (
            <div key={day} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--ag-line)", flexWrap: "wrap" }}>
              <div style={{ width: 96, flex: "none" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{WEEKDAY_FULL_LABELS[day]}</div>
                <div className="ag-muted" style={{ fontSize: 12 }}>
                  {hoursLabel(slots)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 180 }}>
                {slots.map((slot, index) => (
                  <button
                    key={`${slot.start}-${slot.end}`}
                    type="button"
                    className="ag-btn sm"
                    style={{ borderColor: "var(--ag-green)", color: "var(--ag-green-dark)", background: "var(--ag-free)" }}
                    onClick={() => openEdit(day, index)}
                    aria-label={`Modifica fascia ${WEEKDAY_FULL_LABELS[day]} ${slot.start}–${slot.end}`}
                  >
                    {slot.start}–{slot.end}
                    {slot.allowsOnline ? <Video size={14} aria-label="anche online" /> : null}
                  </button>
                ))}
                <button type="button" className="ag-btn sm" style={{ borderStyle: "dashed" }} onClick={() => openNew(day)} aria-label={`Aggiungi fascia il ${WEEKDAY_FULL_LABELS[day]}`}>
                  <Plus size={15} aria-hidden /> {slots.length === 0 ? "Aggiungi" : ""}
                </button>
                {slots.length > 0 ? (
                  // "Giorno libero", non "Chiudi": vale per tutte le settimane, non chiude
                  // un giorno preciso (T1 del test dei compiti, docs/CHANGELOG.md §311).
                  <button type="button" className="ag-link" style={{ fontSize: 13, color: "var(--ag-muted)" }} onClick={() => setDay(day, [])}>
                    Giorno libero<span className="sr-only"> ogni {WEEKDAY_FULL_LABELS[day]?.toLowerCase()}</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <span className="ag-muted" style={{ fontSize: 13, alignSelf: "center" }}>
          Dal lunedì al venerdì:
        </span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="ag-btn sm"
            onClick={() => onChange({ days: template.days.map((s, day) => (day >= 1 && day <= 5 ? preset.slots : s)) })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--ag-line)" }}>
        <label htmlFor="ag-apply-month" style={{ fontWeight: 600, fontSize: 14 }}>
          Applica a
        </label>
        <select id="ag-apply-month" className="ag-input" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}>
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <button type="button" className="ag-btn primary" onClick={() => onApply(monthKey)}>
          Applica
        </button>
      </div>

      {editing ? (
        <SlotEditorModal
          dayLabel={`${WEEKDAY_FULL_LABELS[editing.day]} · settimana tipo`}
          start={editing.start}
          end={editing.end}
          allowsHome={editing.allowsHome}
          allowsOnline={editing.allowsOnline}
          homeMax={editing.homeMax}
          onlineMax={editing.onlineMax}
          liveError={editingError?.error ?? null}
          onStartChange={(start) => setEditing({ ...editing, start })}
          onEndChange={(end) => setEditing({ ...editing, end })}
          onAllowsHomeChange={(allowsHome) => setEditing({ ...editing, allowsHome })}
          onAllowsOnlineChange={(allowsOnline) => setEditing({ ...editing, allowsOnline })}
          onHomeMaxChange={(homeMax) => setEditing({ ...editing, homeMax })}
          onOnlineMaxChange={(onlineMax) => setEditing({ ...editing, onlineMax })}
          onSave={saveEditing}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.index !== null
              ? () => {
                  setDay(editing.day, template.days[editing.day]!.filter((_, i) => i !== editing.index));
                  setEditing(null);
                }
              : undefined
          }
          hasUpcomingBooking={false}
          isNew={editing.index === null}
          canRepeatForMonth={false}
          repeatForMonth={false}
          onRepeatForMonthChange={() => {}}
          repeatWeekdayLabel=""
          repeatMonthLabel=""
        />
      ) : null}
    </div>
  );
}
