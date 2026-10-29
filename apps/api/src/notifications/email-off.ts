import { createHmac, timingSafeEqual } from "node:crypto";
import { NOTIFICATION_ITEMS, NOTIFICATION_TOPICS, type NotificationMuteTarget, type NotificationTopic } from "@professionisti/shared";
import { frontendUrl } from "../email/email-brand";

/**
 * "Non ricevere più email come questa" in fondo alle email
 * (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md): il link
 * porta la persona, senza accedere, a una pagina che spegne l'email di
 * quell'avviso (o dell'argomento, per Messaggi e Promemoria). Il link è
 * firmato: senza la firma giusta non spegne niente. Non scade, come i link
 * di disiscrizione delle newsletter, e al peggio spegne solo un'email.
 */
const SECRET_PURPOSE = "notification-email-off";

function secret(): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "dev-secret-change-me").update(SECRET_PURPOSE).digest("hex");
}

function encodeTarget(target: NotificationMuteTarget): string {
  return target.kind === "item" ? `i:${target.key}` : `t:${target.topic}`;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 32);
}

export function emailOffToken(userId: string, target: NotificationMuteTarget): string {
  const body = Buffer.from(`${userId}|${encodeTarget(target)}`, "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function emailOffUrl(userId: string, target: NotificationMuteTarget): string {
  return `${frontendUrl()}/notifiche/email?t=${emailOffToken(userId, target)}`;
}

export type EmailOffTarget = { kind: "item"; key: string } | { kind: "topic"; topic: NotificationTopic };

/** Chi e cosa dice il link, o `null` se la firma non torna. */
export function readEmailOffToken(token: string): { userId: string; target: EmailOffTarget } | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || body.length > 300) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const decoded = Buffer.from(body, "base64url").toString("utf8");
  const [userId, encoded] = decoded.split("|");
  if (!userId || !encoded) return null;
  if (encoded.startsWith("i:")) {
    const key = encoded.slice(2);
    const item = NOTIFICATION_ITEMS.find((candidate) => candidate.key === key);
    return item && !item.locked ? { userId, target: { kind: "item", key } } : null;
  }
  if (encoded.startsWith("t:")) {
    const topic = encoded.slice(2) as NotificationTopic;
    return (NOTIFICATION_TOPICS as readonly string[]).includes(topic) && topic !== "account" ? { userId, target: { kind: "topic", topic } } : null;
  }
  return null;
}
