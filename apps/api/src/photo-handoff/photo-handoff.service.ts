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
 * - il **codice** nel QR (nel link del telefono): serve solo a mandare foto,
 *   al massimo quante ne ha chieste il computer (1 nella ricerca, dal 17/11 fino
 *   a 10 altrove: docs/changelog/2026-11-17-piu-foto-dal-telefono.md);
 * - la **chiave**, che resta nel computer: serve solo a prenderla.
 * Così chi vede il QR non può leggere la foto. Si salvano solo le impronte
 * (sha256). Una foto vive al massimo 10 minuti nel database e si cancella
 * appena il computer la prende.
 */

/** Quanto vale un codice: abbastanza per prendere il telefono e scattare. */
export const HANDOFF_TTL_MS = 10 * 60_000;
/** Codici al giorno per indirizzo: chi lo usa davvero ne apre pochi. */
export const HANDOFF_PER_IP_DAILY_LIMIT = 30;

/** Foto al massimo per codice (il portfolio del professionista ne tiene 10). */
export const HANDOFF_MAX_PHOTOS = 10;

export type HandoffStatus = "waiting" | "opened" | "sent" | "expired";

type Store = Pick<PrismaClient, "photoHandoff" | "photoHandoffPhoto" | "$queryRaw">;

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

/** Da 1 a 10, 1 se manca o non è un numero intero. */
export function clampMaxPhotos(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(HANDOFF_MAX_PHOTOS, Math.max(1, value)) : 1;
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

  async create(maxPhotos = 1, now: Date = new Date()) {
    const code = secret();
    const key = secret();
    const expiresAt = new Date(now.getTime() + HANDOFF_TTL_MS);
    const max = clampMaxPhotos(maxPhotos);
    await this.prisma.photoHandoff.create({ data: { codeHash: hash(code), keyHash: hash(key), maxPhotos: max, expiresAt } });
    const url = `${frontendUrl()}/scatta/${code}`;
    return { code, key, url, qrSvg: personalLinkQrSvg(url), maxPhotos: max, expiresAt: expiresAt.toISOString() };
  }

  /** Il telefono apre il link: si segna, così il computer scrive "Telefono collegato". */
  async open(code: string, now: Date = new Date()): Promise<{ status: HandoffStatus; sent: number; max: number }> {
    const codeHash = hash(code);
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { openedAt: true, expiresAt: true, sentCount: true, maxPhotos: true } });
    if (!row || row.expiresAt <= now) return { status: "expired", sent: 0, max: 0 };
    if (row.sentCount >= row.maxPhotos) return { status: "sent", sent: row.sentCount, max: row.maxPhotos };
    if (!row.openedAt) await this.prisma.photoHandoff.updateMany({ where: { codeHash, openedAt: null }, data: { openedAt: now } });
    return { status: "opened", sent: row.sentCount, max: row.maxPhotos };
  }

  /**
   * Il telefono manda una foto. Il posto si prende con un solo comando sul
   * database (sentCount < maxPhotos), così due invii insieme non ne passano uno in più.
   */
  async upload(
    code: string,
    photo: Buffer,
    mediaType: string,
    now: Date = new Date(),
  ): Promise<{ result: "ok"; sent: number; max: number } | { result: "expired" | "full" }> {
    const codeHash = hash(code);
    const rows = await this.prisma.$queryRaw<{ sentCount: number; maxPhotos: number }[]>`
      UPDATE photo_handoffs SET "sentCount" = "sentCount" + 1, "openedAt" = COALESCE("openedAt", ${now})
      WHERE "codeHash" = ${codeHash} AND "sentCount" < "maxPhotos" AND "expiresAt" > ${now}
      RETURNING "sentCount", "maxPhotos"`;
    const taken = rows[0];
    if (taken) {
      await this.prisma.photoHandoffPhoto.create({ data: { codeHash, photo: new Uint8Array(photo), mediaType } });
      return { result: "ok", sent: taken.sentCount, max: taken.maxPhotos };
    }
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { expiresAt: true } });
    return { result: row && row.expiresAt > now ? "full" : "expired" };
  }

  /**
   * Il computer chiede se è arrivata una foto: le consegna una alla volta,
   * ognuna una volta sola, e la cancella. "done" quando le ha prese tutte.
   */
  async take(
    code: string,
    key: string,
    now: Date = new Date(),
  ): Promise<{ status: "waiting" | "opened" | "expired" | "done" } | { status: "sent"; photo: Buffer; mediaType: string }> {
    const codeHash = hash(code);
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { keyHash: true, expiresAt: true, openedAt: true, sentCount: true, maxPhotos: true } });
    if (!row || !sameHash(row.keyHash, hash(key)) || row.expiresAt <= now) return { status: "expired" };
    const next = await this.prisma.photoHandoffPhoto.findFirst({ where: { codeHash }, orderBy: { id: "asc" } });
    if (next) {
      const { count } = await this.prisma.photoHandoffPhoto.deleteMany({ where: { id: next.id } });
      // Presa nel frattempo da un'altra richiesta: alla prossima domanda c'è la successiva.
      if (count === 0) return { status: "opened" };
      return { status: "sent", photo: Buffer.from(next.photo), mediaType: next.mediaType };
    }
    // Il codice resta fino alla chiusura della finestra (o ai 10 minuti): dal
    // 18/11 il computer può togliere una foto e liberare il posto (`release`).
    if (row.sentCount >= row.maxPhotos) return { status: "done" };
    return { status: row.openedAt ? "opened" : "waiting" };
  }

  /**
   * Il computer toglie con la X una foto arrivata (docs/changelog/2026-11-18-foto-dal-telefono-anteprime.md):
   * il posto torna libero e il telefono può mandarne un'altra con lo stesso codice.
   */
  async release(code: string, key: string, now: Date = new Date()): Promise<{ sent: number; max: number } | null> {
    const codeHash = hash(code);
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { keyHash: true, expiresAt: true } });
    if (!row || !sameHash(row.keyHash, hash(key)) || row.expiresAt <= now) return null;
    await this.prisma.photoHandoff.updateMany({ where: { codeHash, sentCount: { gt: 0 } }, data: { sentCount: { decrement: 1 } } });
    const after = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { sentCount: true, maxPhotos: true } });
    return after ? { sent: after.sentCount, max: after.maxPhotos } : null;
  }

  /** Il computer chiude la finestra: il codice e le foto non prese non servono più. */
  async cancel(code: string, key: string): Promise<void> {
    const codeHash = hash(code);
    const row = await this.prisma.photoHandoff.findUnique({ where: { codeHash }, select: { keyHash: true } });
    if (!row || !sameHash(row.keyHash, hash(key))) return;
    await this.prisma.photoHandoffPhoto.deleteMany({ where: { codeHash } });
    await this.prisma.photoHandoff.deleteMany({ where: { codeHash } });
  }

  /** Codici scaduti e foto mai prese: via ogni 10 minuti. Una foto non vive più del suo codice. */
  @ScheduledJob("*/10 * * * *")
  async removeExpired(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.photoHandoff.deleteMany({ where: { expiresAt: { lte: now } } });
    await this.prisma.photoHandoffPhoto.deleteMany({ where: { createdAt: { lte: new Date(now.getTime() - HANDOFF_TTL_MS) } } });
    return count;
  }
}
