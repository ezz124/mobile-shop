import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed';

let prisma: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('postgres')) {
    throw new Error('DATABASE_URL يجب أن يكون رابط PostgreSQL صالحًا');
  }
  return new PrismaClient({ datasources: { db: { url } }, log: ['error', 'warn'] });
}

export function getPrisma(): PrismaClient {
  if (!prisma) prisma = getPrismaClient();
  return prisma;
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export async function initDatabase(): Promise<void> {
  const db = getPrismaClient();
  await seedDatabase(db);
  await db.$disconnect();
}

export { prisma as prismaClientRef };
