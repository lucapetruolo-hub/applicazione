import { PrismaClient } from "../generated/client";

// Singleton per evitare troppe connessioni in dev (hot reload Next.js/Nest).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "../generated/client";
