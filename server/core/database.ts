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

/** انتظر الاتصال بالقاعدة مع إعادة المحاولة */
async function waitForDb(db: PrismaClient, retries = 5, delayMs = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await db.$connect();
      return;
    } catch {
      if (i < retries - 1) {
        console.warn(`[db] فشل الاتصال، إعادة المحاولة (${i + 1}/${retries - 1})...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(`[db] تعذر الاتصال بقاعدة البيانات بعد ${retries} محاولات`);
}

export async function initDatabase(): Promise<void> {
  const db = getPrismaClient();
  try {
    await waitForDb(db);

    // تخطي الـ seed إذا كانت البيانات موجودة بالفعل (لتسريع إعادة التشغيل في التطوير)
    const [userCount, permCount] = await Promise.all([
      db.user.count(),
      db.permission.count(),
    ]);

    const needsSeed = userCount === 0 || permCount === 0;
    if (needsSeed) {
      console.log('[db] تهيئة قاعدة البيانات للمرة الأولى...');
      await seedDatabase(db);
      console.log('[db] تمت التهيئة بنجاح ✓');
    } else {
      console.log('[db] قاعدة البيانات جاهزة ✓');
    }
  } catch (err) {
    console.warn('[db] تحذير:', (err as Error).message?.split('\n')[0]);
  } finally {
    await db.$disconnect();
  }
}

export { prisma as prismaClientRef };
