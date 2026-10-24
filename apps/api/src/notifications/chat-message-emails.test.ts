import { describe, expect, it } from "vitest";
import { chatEmailGroups } from "./chat-message-emails.service";

const now = new Date("2026-10-24T15:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const row = (id: string, minutes: number, thread = "r1", userId = "u1", type = "TIMELINE_MESSAGE_FROM_PROFESSIONAL") => ({
  id,
  userId,
  type,
  payload: { guidedRequestId: thread, professionalProfileId: "p1" },
  createdAt: minutesAgo(minutes),
});

describe("chatEmailGroups (§330)", () => {
  it("aspetta 10 minuti dal primo messaggio non letto", () => {
    expect(chatEmailGroups([row("a", 9)], [], now)).toEqual({ groups: [], covered: [] });
    const { groups, covered } = chatEmailGroups([row("a", 10)], [], now);
    expect(groups).toHaveLength(1);
    expect(covered).toEqual(["a"]);
  });

  it("una sola email per conversazione, con anche i messaggi arrivati dopo", () => {
    const { groups, covered } = chatEmailGroups([row("a", 12), row("b", 3), row("c", 15, "r2")], [], now);
    expect(groups.map((g) => [g.guidedRequestId, g.notificationIds])).toEqual([
      ["r1", ["a", "b"]],
      ["r2", ["c"]],
    ]);
    expect(covered.sort()).toEqual(["a", "b", "c"]);
  });

  it("niente seconda email finché la conversazione già avvisata non viene letta", () => {
    const { groups, covered } = chatEmailGroups([row("b", 20)], [row("a", 40)], now);
    expect(groups).toEqual([]);
    expect(covered).toEqual(["b"]);
  });

  it("conversazioni di utenti diversi restano separate", () => {
    const { groups } = chatEmailGroups([row("a", 12, "r1", "u1"), row("b", 12, "r1", "u2", "TIMELINE_MESSAGE_FROM_CLIENT")], [row("x", 30, "r1", "u1")], now);
    expect(groups.map((g) => [g.userId, g.type])).toEqual([["u2", "TIMELINE_MESSAGE_FROM_CLIENT"]]);
  });
});
