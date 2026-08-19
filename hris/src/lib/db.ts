import { PrismaClient } from '@prisma/client';

/**
 * Prisma client with auto-retry on Neon cold starts.
 *
 * Neon's free/hobby tier auto-pauses the compute after ~5 minutes of
 * inactivity. The first query after the pause fails with P1001
 * ("Can't reach database server") while Neon spins the compute back up
 * (usually 1–3 seconds). We transparently retry those failures so users
 * never see the cold-start error.
 *
 * Non-connection errors bubble up immediately.
 */

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof buildClient> };

const COLD_START_MARKERS = [
  "Can't reach database server",
  'P1001',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'Connection terminated unexpectedly',
];

function isColdStart(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return COLD_START_MARKERS.some((m) => msg.includes(m));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Retry policy: 3 attempts with 300ms, 900ms, 2100ms backoff (~3.3s total)
  const retryDelays = [300, 900, 2100];

  return client.$extends({
    query: {
      async $allOperations({ args, query, operation, model }) {
        let lastError: unknown;
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            lastError = e;
            if (!isColdStart(e) || attempt === retryDelays.length) throw e;
            if (attempt === 0) {
              console.warn(
                `[db] cold start detected on ${model ?? '?'}.${operation}, retrying (attempt ${attempt + 1})…`
              );
            }
            await sleep(retryDelays[attempt]);
          }
        }
        throw lastError;
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
