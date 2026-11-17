import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { frontendUrl } from "../email/email-brand";
import { sharedBudgetStore } from "../common/daily-budget";
import { ScheduledJob } from "../common/scheduled-job";
import { personalLinkQrSvg } from "../professionals/personal-link.service";

/**
 * "Scatta dal telefono" (docs/changelog/2026-11-16-scatta-dal-telefono.md): dal
 * computer si apre un codice QR, il telefono lo inquadra, scatta e la foto
 * arriva da sola nella finestra del computer. Due segreti diversi:
 * - il **codice** nel QR (nel link del telefono): serve solo a mandare UNA foto;
 * - la **chiave**, che resta nel computer: serve solo a prenderla.
 * Così chi vede il QR non può leggere la foto. Si salvano solo le impronte
 * (sha256). La foto vive al massimo 10 minuti nel database e si cancella
 * appena il computer la prende.
 */

/** Quanto vale un codice: abbastanza per prendere il telefono e scattare. */
export const HANDOFF_TTL_MS = 10 * 60_000;
/** Codici al giorno per indirizzo: chi lo usa davvero ne apre pochi. */
export const HANDOFF_PER_IP_DAILY_LIMIT = 30;

export type HandoffStatus = "waiting" | "opened" | "sent" | "expired";

type Store = Pick<PrismaClient, "photoHandoff">;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Codice e chiave: 128 bit casuali, in caratteri sicuri per un indirizzo. */
function secret(): string {
  return randomBytes(16).toString("base64url");
}

/** Solo caratteri base64url, lunghezza giusta: il resto non arriva al database. */
export function validCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value);
}

@Injectable()
export class PhotoHandoffService {
  constructor(@Inject(PRISMA) private readonly prisma: Store) {}

  /** Un codice in più per questo indirizzo oggi? */
  async takeForIp(ip: string, now: Date = new Date()): Promise<boolean> {
    const today = now.toISOString().slice(0, 10);
    const raw = Number(process.env.PHOTO_HANDOFF_IP_DAILY_LIMIT?.trim() || NaN);
    const limit = Number.isInteger(raw) && raw >= 0 ? raw : HANDOFF_PER_IP_DAILY_LIMIT;
    if (limit === 0) return false;
    const print = hash(`${ip}|${today}`).slice(0, 24);
    try {
      return (await sharedBudgetStore().take(`foto-telefono-ip:${print}`, today, limit)) !== null;
    } catch {
      return false;
    }
  }

  async create(now: Date = new Date()) {
    const code = secret();
    const key = secret();
    const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS);
    await this.prisma.photoHandoff.create({ data: { codeHash: hash(code), keyHash: hash(key), expiresAt } });
    const url = `${frontendUrl()}/scatta/${code}`;
    return { code, key, url, qrSvg: personalLinkQrSvg(url), expiresAt: expiresAt.toISOString() };
  }

  /** Il telefono apre il link: si segna, così il computer scrive "Telefono collegato". */
  async open(code: string, now: Date = new Date()): Promise<HandoffStatus> {
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash: hash(code) }, select: { mediaType: true, openedAt: true, expiresAt: true } });
    if (!row || row.expiresAt <= now) return "expired";
    if (row.mediaType) return "sent";
    if (!row.openedAt) await this.prisma.photoHandoff.updateMany({ where: { codeHash: hash(code), openedAt: null }, data: { openedAt: now } });
    return "opened";
  }

  /** Il telefono manda la foto: una sola per codice. */
  async upload(code: string, photo: Buffer, mediaType: string, now: Date = new Date()): Promise<"ok" | "expired" | "sent"> {
    const codeHash = hash(code);
    const { count } = await this.prisma.photoHandoff.updateMany({
      where: { codeHash, mediaType: null, expiresAt: { gt: now } },
      data: { photo: new Uint8Array(photo), mediaType, openedAt: now },
    });
    if (count === 1) return "ok";
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { mediaType: true, expiresAt: true } });
    return row && row.expiresAt > now && row.mediaType ? "sent" : "expired";
  }

  /**
   * Il computer chiede se la foto è arrivata. Con la foto la consegna una
   * volta sola e cancella la riga.
   */
  async take(
    code: string,
    key: string,
    now: Date = new Date(),
  ): Promise<{ status: "waiting" | "opened" | "expired" } | { status: "sent"; photo: Buffer; mediaType: string }> {
    const codeHash = hash(code);
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash } });
    if (!row || !sameHash(row.keyHash, hash(key)) || row.expiresAt <= now) return { status: "expired" };
    if (!row.photo || !row.mediaType) return { status: row.openedAt ? "opened" : "waiting" };
    const { count } = await this.prisma.photoHandoff.deleteMany({ where: { codeHash } });
    if (count === 0) return { status: "expired" };
    return { status: "sent", photo: Buffer.from(row.photo), mediaType: row.mediaType };
  }

  /** Il computer chiude la finestra: il codice non serve più. */
  async cancel(code: string, key: string): Promise<void> {
    const codeHash = hash(code);
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { keyHash: true } });
    if (row && sameHash(row.keyHash, hash(key))) await this.prisma.photoHandoff.deleteMany({ where: { codeHash } });
  }

  /** Foto e codici scaduti, mai presi: via ogni 10 minuti. */
  @ScheduledJob("*/10 * * * *")
  async removeExpired(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.photoHandoff.deleteMany({ where: { expiresAt: { lte: now } } });
    return count;
  }
}
