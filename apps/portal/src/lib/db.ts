import { PrismaClient } from '@prisma/client-portal';

const globalForPrisma = globalThis as typeof globalThis & {
  portalPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.portalPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.portalPrisma = prisma;
}
