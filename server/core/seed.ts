import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, type PermissionKey } from '../../src/shared/ipc';

const ROLE_DEFS: { key: string; nameAr: string; description: string; permissions: PermissionKey[] }[] = [
  {
    key: 'admin', nameAr: 'مدير النظام', description: 'صلاحيات كاملة على النظام',
    permissions: [...PERMISSIONS],
  },
  {
    key: 'manager', nameAr: 'مدير المتجر', description: 'إدارة كاملة عدا المستخدمين والإعدادات',
    permissions: ['dashboard', 'pos', 'sales', 'purchases', 'products', 'phones', 'accessories', 'inventory', 'customers', 'suppliers', 'expenses', 'treasury', 'returns', 'invoices', 'reports'],
  },
  {
    key: 'cashier', nameAr: 'كاشير', description: 'نقطة البيع والمبيعات والعملاء',
    permissions: ['dashboard', 'pos', 'sales', 'customers', 'invoices', 'returns'],
  },
  {
    key: 'sales_employee', nameAr: 'موظف مبيعات', description: 'البيع وخدمة العملاء',
    permissions: ['dashboard', 'pos', 'sales', 'customers', 'invoices', 'products', 'phones', 'accessories', 'returns'],
  },
  {
    key: 'inventory_employee', nameAr: 'موظف مخزن', description: 'إدارة المنتجات والمخزون والمشتريات',
    permissions: ['dashboard', 'products', 'phones', 'accessories', 'inventory', 'purchases', 'suppliers', 'invoices'],
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  storeName: 'متجر الهواتف النقّالة',
  storePhone: '',
  storeAddress: '',
  currency: 'ج.م',
  invoiceFooter: 'شكراً لتعاملكم معنا — نتمنى لكم يوماً سعيداً',
  lowStockThreshold: '3',
  autoBackup: 'true',
  autoBackupIntervalHours: '12',
  printerWidth: '80mm',
  taxEnabled: 'false',
  taxRate: '0',
};

/** بيانات أساسية إلزامية — آمنة للتشغيل المتكرر (idempotent) */
export async function seedDatabase(db: PrismaClient): Promise<void> {
  // الصلاحيات
  for (const key of PERMISSIONS) {
    await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, nameAr: key },
    });
  }

  // الأدوار + صلاحياتها — داخل transaction لمنع race condition مع PgBouncer
  for (const def of ROLE_DEFS) {
    const role = await db.role.upsert({
      where: { key: def.key },
      update: { nameAr: def.nameAr, description: def.description, isSystem: true },
      create: { key: def.key, nameAr: def.nameAr, description: def.description, isSystem: true },
    });
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId: role.id } }),
      db.rolePermission.createMany({
        data: def.permissions.map((p) => ({ roleId: role.id, permissionKey: p })),
        skipDuplicates: true,
      }),
    ]);
  }

  // المستخدم الافتراضي
  const adminRole = await db.role.findUnique({ where: { key: 'admin' } });
  const userCount = await db.user.count();
  if (userCount === 0 && adminRole) {
    await db.user.create({
      data: {
        username: 'admin',
        fullName: 'مدير النظام',
        passwordHash: await bcrypt.hash('admin123', 10),
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('Seeded default user: admin / admin123');
  }

  // تصنيفات المنتجات
  const categories = ['هواتف', 'شواحن', 'سماعات', 'كابلات', 'حمايات شاشة', 'أغطية', 'باور بانك', 'ساعات ذكية', 'بطاقات ذاكرة', 'إكسسوارات أخرى'];
  for (const name of categories) {
    await db.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  // الماركات
  const brands = ['Samsung', 'Apple', 'Xiaomi', 'Redmi', 'Oppo', 'Vivo', 'Realme', 'Huawei', 'Honor', 'Infinix', 'Tecno', 'Nokia', 'Lenovo', 'Anker', 'أخرى'];
  for (const name of brands) {
    await db.brand.upsert({ where: { name }, update: {}, create: { name } });
  }

  // تصنيفات المصروفات
  const expenseCats = ['إيجار', 'رواتب', 'كهرباء وماء', 'إنترنت وهاتف', 'نقل ومواصلات', 'صيانة', 'دعاية وتسويق', 'مصروفات أخرى'];
  for (const name of expenseCats) {
    await db.expenseCategory.upsert({ where: { name }, update: {}, create: { name, isSystem: true } });
  }

  // العدادات
  for (const name of ['sale', 'purchase', 'return']) {
    await db.counter.upsert({ where: { name }, update: {}, create: { name, value: 0 } });
  }

  // الإعدادات
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}
