import { getPrisma } from './database';
import { AppError } from './errors';

const TABLES = [
  'Permission', 'Role', 'RolePermission', 'User', 'Session', 'Brand', 'Category', 'Product',
  'Customer', 'Supplier', 'Sale', 'SaleItem', 'Purchase', 'PurchaseItem', 'PhoneUnit',
  'InventoryMovement', 'ExpenseCategory', 'Expense', 'TreasuryTransaction', 'Payment',
  'Return', 'ReturnItem', 'Counter', 'Setting', 'AuditLog',
] as const;

type TableName = (typeof TABLES)[number];
type Snapshot = { version: 1; createdAt: string; tables: Record<TableName, Record<string, unknown>[]> };
type StorageObject = { name: string; created_at?: string; metadata?: { size?: number } };

export interface BackupFileMeta { name: string; fullPath: string; size: number; createdAt: string }

function storageConfig(): { url: string; key: string; bucket: string } {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BACKUPS_BUCKET ?? 'mbile-backups';
  if (!url || !key) throw new AppError('لم يتم إعداد Supabase Storage للنسخ الاحتياطي');
  return { url, key, bucket };
}

function safeKey(key: string): string {
  if (!/^backups\/[a-zA-Z0-9_-]+\.json$/.test(key)) throw new AppError('معرّف النسخة الاحتياطية غير صالح');
  return key;
}

async function storageFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  });
  return response;
}

async function ensureBucket(): Promise<void> {
  const { bucket } = storageConfig();
  const response = await storageFetch('/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 50 * 1024 * 1024 }),
  });
  if (response.ok || response.status === 409) return;
  const text = await response.text().catch(() => '');
  if (text.includes('BucketAlreadyExists') || text.includes('"statusCode":"409"')) return;
  
  console.error('[Backup Error] ensureBucket failed:', response.status, text);
  throw new AppError('تعذر تجهيز مساحة النسخ الاحتياطي على Supabase');
}

async function loadSnapshot(key: string): Promise<Snapshot> {
  const { bucket } = storageConfig();
  const response = await storageFetch(`/object/${encodeURIComponent(bucket)}/${safeKey(key)}`);
  if (!response.ok) throw new AppError('تعذر تحميل النسخة الاحتياطية من Supabase');
  try {
    return JSON.parse(await response.text()) as Snapshot;
  } catch {
    throw new AppError('ملف النسخة الاحتياطية غير صالح');
  }
}

function validateSnapshot(snapshot: Snapshot): void {
  if (snapshot.version !== 1 || !snapshot.createdAt || !snapshot.tables) throw new AppError('ملف النسخة الاحتياطية غير صالح');
  for (const table of TABLES) {
    if (!Array.isArray(snapshot.tables[table])) throw new AppError(`النسخة الاحتياطية ناقصة: ${table}`);
  }
}

export async function createBackup(name?: string): Promise<BackupFileMeta> {
  await ensureBucket();
  const db = getPrisma();
  const tables = {} as Snapshot['tables'];
  for (const table of TABLES) tables[table] = await db.$queryRawUnsafe(`SELECT * FROM "${table}"`) as Record<string, unknown>[];

  const now = new Date();
  const prefix = name?.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
  const key = `backups/${prefix ? `${prefix}-` : ''}${now.toISOString().replace(/[-:.TZ]/g, '')}.json`;
  const content = JSON.stringify({ version: 1, createdAt: now.toISOString(), tables } satisfies Snapshot);
  const { bucket } = storageConfig();
  const response = await storageFetch(`/object/${encodeURIComponent(bucket)}/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' },
    body: content,
  });
  if (!response.ok) throw new AppError('تعذر رفع النسخة الاحتياطية إلى Supabase');
  
  // الاحتفاظ بآخر نسختين فقط لتوفير المساحة
  try {
    const backups = await listBackups();
    if (backups.length > 2) {
      for (const old of backups.slice(2)) {
        await storageFetch(`/object/${encodeURIComponent(bucket)}/${safeKey(old.fullPath)}`, {
          method: 'DELETE',
        }).catch(err => console.error('[Backup Error] failed to delete old backup:', err));
      }
    }
  } catch (err) {
    console.error('[Backup Error] failed to prune old backups:', err);
  }

  return { name: key.split('/').pop()!, fullPath: key, size: Buffer.byteLength(content), createdAt: now.toISOString() };
}

export async function listBackups(): Promise<BackupFileMeta[]> {
  await ensureBucket();
  const { bucket } = storageConfig();
  const response = await storageFetch(`/object/list/${encodeURIComponent(bucket)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'backups/', limit: 100, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  if (!response.ok) throw new AppError('تعذر قراءة النسخ الاحتياطية من Supabase');
  const objects = await response.json() as StorageObject[];
  return objects.filter((object) => object.name.endsWith('.json')).map((object) => {
    const key = object.name.startsWith('backups/') ? object.name : `backups/${object.name}`;
    return {
    name: key.split('/').pop()!,
    fullPath: key,
    size: object.metadata?.size ?? 0,
    createdAt: object.created_at ?? new Date(0).toISOString(),
    };
  });
}

export async function validateBackup(key: string): Promise<{ ok: boolean; info?: string }> {
  const snapshot = await loadSnapshot(key);
  validateSnapshot(snapshot);
  return { ok: true, info: `نسخة سليمة — عدد المستخدمين: ${snapshot.tables.User.length}` };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export async function restoreBackup(key: string): Promise<{ ok: boolean }> {
  const snapshot = await loadSnapshot(key);
  validateSnapshot(snapshot);
  // لا نبدأ أي عملية مدمرة قبل حفظ حالة النظام الحالية في مساحة منفصلة وآمنة.
  await createBackup('pre-restore');
  const db = getPrisma();

  await db.$transaction(async (tx) => {
    const tableList = TABLES.map(quoteIdentifier).join(', ');
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);

    for (const table of TABLES) {
      const rows = snapshot.tables[table];
      if (rows.length === 0) continue;
      const allowedColumns = await tx.$queryRawUnsafe<Array<{ column_name: string }>>(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', table
      );
      const allowed = new Set(allowedColumns.map((column) => column.column_name));
      const columns = Object.keys(rows[0]);
      if (columns.length === 0 || columns.some((column) => !allowed.has(column)) || rows.some((row) => Object.keys(row).some((column) => !allowed.has(column)))) {
        throw new AppError(`بيانات جدول ${table} غير صالحة في النسخة الاحتياطية`);
      }
      const fields = columns.map(quoteIdentifier).join(', ');
      const params = columns.map((_, index) => `$${index + 1}`).join(', ');
      const statement = `INSERT INTO ${quoteIdentifier(table)} (${fields}) VALUES (${params})`;
      for (const row of rows) await tx.$executeRawUnsafe(statement, ...columns.map((column) => row[column] ?? null));
      if (columns.includes('id')) {
        const max = await tx.$queryRawUnsafe<Array<{ max: number | null }>>(`SELECT MAX("id") AS max FROM ${quoteIdentifier(table)}`);
        await tx.$executeRawUnsafe('SELECT setval(pg_get_serial_sequence($1, $2), $3, true)', quoteIdentifier(table), 'id', Math.max(1, max[0]?.max ?? 1));
      }
    }
  }, { timeout: 60_000 });
  return { ok: true };
}

export async function maybeAutoBackup(): Promise<void> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const db = getPrisma();
  const settings = await db.setting.findMany({ where: { key: { in: ['autoBackup', 'autoBackupIntervalHours'] } } });
  const values = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  if (values.autoBackup !== 'true' || await db.sale.count() === 0) return;
  const hours = Math.max(1, Number(values.autoBackupIntervalHours ?? 12));
  const latest = (await listBackups())[0];
  if (latest && Date.now() - new Date(latest.createdAt).getTime() < hours * 3_600_000) return;
  await createBackup();
}

/** يفحص الاستحقاق دورياً؛ الإعداد نفسه يحدد الفترة الفعلية بين النسخ. */
export function startAutoBackupScheduler(): void {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const run = () => void maybeAutoBackup().catch((error) => console.warn('Automatic backup failed:', error));
  run();
  const timer = setInterval(run, 15 * 60 * 1000);
  timer.unref();
}
