import { getPrisma } from './database';
import { login, logout, validateSession, hashPassword, toAuthUser, type AuthSession } from './auth';
import { AppError, toUserMessage } from './errors';
import { audit, cashBalance, customerDebt, supplierBalance, startOfDay, addDays, parseDate, createTreasuryTx } from './helpers';
import { createSale, deleteSale, addSalePayment, saleProfit, toSaleRow } from './services/sales';
import { createPurchase, deletePurchase, addPurchasePayment, toPurchaseRow } from './services/purchases';
import { createReturn } from './services/returns';
import * as reports from './services/reports';
import { DEFAULT_SETTINGS } from './seed';
import type { ApiChannel, ApiMap, PermissionKey, AppSettings, IpcResult } from '../../src/shared/ipc';

type AnyArgs = Record<string, unknown> & { token?: string };

interface Ctx {
  session: AuthSession | null;
}

export interface ApiRegistrar {
  handle(channel: string, listener: (event: unknown, args: AnyArgs) => Promise<IpcResult<unknown>>): void;
}

function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data ?? null)) as T;
}

function register(
  ipc: ApiRegistrar,
  channel: ApiChannel,
  permission: PermissionKey | PermissionKey[] | null,
  handler: (args: never, ctx: Ctx) => Promise<unknown>
): void {
  ipc.handle(channel, async (_event, rawArgs: AnyArgs) => {
    try {
      const args = (rawArgs ?? {}) as never;
      let session: AuthSession | null = null;
      if (channel !== 'auth:login') {
        session = await validateSession(getPrisma(), (rawArgs as { token?: string })?.token ?? '');
      }
      if (permission) {
        const perms = Array.isArray(permission) ? permission : [permission];
        if (!session || !perms.some((p) => session!.permissions.includes(p))) {
          throw new AppError('ليس لديك صلاحية للوصول إلى هذه العملية');
        }
      }
      const data = await handler(args, { session });
      return { ok: true, data: serialize(data) };
    } catch (e) {
      console.error(`[ipc:${channel}]`, e);
      return { ok: false, error: toUserMessage(e) };
    }
  });
}

function paginate(args: { page?: number; pageSize?: number }): { skip: number; take: number; page: number; pageSize: number } {
  const p = Math.max(1, Math.floor(args.page ?? 1));
  const size = Math.min(100, Math.max(5, Math.floor(args.pageSize ?? 20)));
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size };
}

function today(): { gte: Date; lt: Date } {
  const t = startOfDay();
  return { gte: t, lt: addDays(t, 1) };
}

// type-safe argument accessors
function req<C extends ApiChannel>(args: unknown): ApiMap[C]['req'] {
  return args as ApiMap[C]['req'];
}

export function registerApi(ipc: ApiRegistrar): void {
  const db = () => getPrisma();

  // ─────────────── المصادقة ───────────────
  register(ipc, 'auth:login', null, async (a) => {
    const args = req<'auth:login'>(a);
    if (!args.username?.trim() || !args.password) throw new AppError('أدخل اسم المستخدم وكلمة المرور');
    return login(db(), args.username.trim(), args.password);
  });

  register(ipc, 'auth:logout', null, async (a) => {
    const token = req<'auth:logout'>(a).token;
    await logout(db(), token);
    return { ok: true };
  });

  register(ipc, 'auth:me', null, async (a) => {
    const token = req<'auth:me'>(a).token;
    const session = await validateSession(db(), token);
    const user = await db().user.findUnique({
      where: { id: session.userId },
      include: { role: { include: { permissions: true } } },
    });
    if (!user) throw new AppError('المستخدم غير موجود');
    return toAuthUser(user, session.permissions);
  });

  register(ipc, 'auth:changePassword', null, async (a, ctx) => {
    const args = req<'auth:changePassword'>(a);
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const user = await db().user.findUnique({ where: { id: ctx.session.userId } });
    if (!user) throw new AppError('المستخدم غير موجود');
    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(args.oldPassword, user.passwordHash);
    if (!valid) throw new AppError('كلمة المرور الحالية غير صحيحة');
    if ((args.newPassword ?? '').length < 6) throw new AppError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    await db().user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(args.newPassword) } });
    await audit(db(), ctx.session, 'تغيير كلمة المرور', 'User', user.id);
    return { ok: true };
  });

  // ─────────────── المستخدمون والأدوار ───────────────
  register(ipc, 'users:list', 'users', async (a) => {
    const args = req<'users:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.search ? { OR: [{ username: { contains: args.search , mode: 'insensitive' as const } }, { fullName: { contains: args.search , mode: 'insensitive' as const } }] } : {}),
      ...(args.roleId ? { roleId: args.roleId } : {}),
      ...(typeof args.isActive === 'boolean' ? { isActive: args.isActive } : {}),
    };
    const [data, total] = await Promise.all([
      db().user.findMany({ where, include: { role: true }, orderBy: { id: 'asc' }, skip, take }),
      db().user.count({ where }),
    ]);
    return { data, total, page, pageSize };
  });

  register(ipc, 'users:create', 'users', async (a, ctx) => {
    const args = req<'users:create'>(a);
    if (!args.username?.trim() || !args.fullName?.trim()) throw new AppError('أدخل اسم المستخدم والاسم الكامل');
    if ((args.password ?? '').length < 6) throw new AppError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    const user = await db().user.create({
      data: {
        username: args.username.trim(),
        fullName: args.fullName.trim(),
        passwordHash: await hashPassword(args.password),
        phone: args.phone || null,
        roleId: args.roleId,
        isActive: args.isActive ?? true,
      },
      include: { role: true },
    });
    await audit(db(), ctx.session, 'إضافة مستخدم', 'User', user.id, { username: user.username });
    return user;
  });

  register(ipc, 'users:update', 'users', async (a, ctx) => {
    const args = req<'users:update'>(a);
    const user = await db().user.update({
      where: { id: args.id },
      data: {
        fullName: args.fullName,
        phone: args.phone || null,
        roleId: args.roleId,
        isActive: args.isActive,
      },
      include: { role: true },
    });
    await audit(db(), ctx.session, 'تعديل مستخدم', 'User', user.id, { username: user.username });
    return user;
  });

  register(ipc, 'users:resetPassword', 'users', async (a, ctx) => {
    const args = req<'users:resetPassword'>(a);
    if ((args.newPassword ?? '').length < 6) throw new AppError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    await db().user.update({ where: { id: args.id }, data: { passwordHash: await hashPassword(args.newPassword) } });
    await db().session.deleteMany({ where: { userId: args.id } });
    await audit(db(), ctx.session, 'إعادة تعيين كلمة مرور', 'User', args.id);
    return { ok: true };
  });

  register(ipc, 'users:delete', 'users', async (a, ctx) => {
    const args = req<'users:delete'>(a);
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    if (args.id === ctx.session.userId) throw new AppError('لا يمكنك حذف حسابك الحالي');
    const salesCount = await db().sale.count({ where: { userId: args.id } });
    if (salesCount > 0) throw new AppError('لا يمكن حذف مستخدم له فواتير بيع — عطّل الحساب بدلاً من ذلك');
    await db().user.delete({ where: { id: args.id } });
    await audit(db(), ctx.session, 'حذف مستخدم', 'User', args.id);
    return { ok: true };
  });

  register(ipc, 'roles:list', 'users', async () => {
    const roles = await db().role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { id: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id, key: r.key, nameAr: r.nameAr, description: r.description, isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permissionKey),
      userCount: r._count.users,
    }));
  });

  register(ipc, 'roles:updatePermissions', 'users', async (a, ctx) => {
    const args = req<'roles:updatePermissions'>(a);
    const role = await db().role.findUnique({ where: { id: args.roleId } });
    if (!role) throw new AppError('الدور غير موجود');
    if (role.key === 'admin') throw new AppError('لا يمكن تعديل صلاحيات مدير النظام');
    await db().$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (args.permissionKeys.length > 0) {
        await tx.rolePermission.createMany({
          data: args.permissionKeys.map((p) => ({ roleId: role.id, permissionKey: p })),
        });
      }
    });
    await audit(db(), ctx.session, 'تعديل صلاحيات دور', 'Role', role.id, { permissions: args.permissionKeys });
    const updated = await db().role.findUnique({ where: { id: role.id }, include: { permissions: true } });
    return { ...updated, permissions: updated!.permissions.map((p) => p.permissionKey) };
  });

  // ─────────────── المنتجات والكتالوج ───────────────
  register(ipc, 'products:list', ['products', 'phones', 'accessories', 'inventory', 'purchases'], async (a) => {
    const args = req<'products:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const thresholdRow = await db().setting.findUnique({ where: { key: 'lowStockThreshold' } });
    const lowStockThreshold = Math.max(0, Number(thresholdRow?.value ?? 3) || 3);
    const where = {
      ...(args.search ? {
        OR: [
          { name: { contains: args.search , mode: 'insensitive' as const } },
          { sku: { contains: args.search , mode: 'insensitive' as const } },
          { barcode: { contains: args.search , mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(args.type ? { type: args.type } : {}),
      ...(args.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args.brandId ? { brandId: args.brandId } : {}),
      ...(args.activeOnly ? { isActive: true } : {}),
      ...(args.lowStock ? { OR: [
        { quantity: { lte: db().product.fields.minStock } },
        { quantity: { lte: lowStockThreshold } },
      ] } : {}),
    };
    const [data, total] = await Promise.all([
      db().product.findMany({
        where,
        include: { category: true, brand: true },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      db().product.count({ where }),
    ]);
    return { data, total, page, pageSize };
  });

  register(ipc, 'products:get', ['products', 'phones', 'accessories'], async (a) => {
    const args = req<'products:get'>(a);
    const product = await db().product.findUnique({
      where: { id: args.id },
      include: { category: true, brand: true, phoneUnits: { orderBy: { id: 'desc' } } },
    });
    if (!product) throw new AppError('المنتج غير موجود');
    return product;
  });

  register(ipc, 'products:create', ['products', 'phones', 'accessories'], async (a, ctx) => {
    const args = req<'products:create'>(a);
    if (!args.name?.trim()) throw new AppError('أدخل اسم المنتج');
    if (args.purchasePrice == null || args.purchasePrice < 0) throw new AppError('أدخل سعر شراء صحيحاً');
    if (args.sellingPrice == null || args.sellingPrice < 0) throw new AppError('أدخل سعر بيع صحيحاً');
    const unitPurchasePrice = Math.floor(args.purchasePrice);
    const unitSellingPrice = Math.floor(args.sellingPrice);
    const initialUnits = args.initialPhoneUnits ?? [];
    if (args.type === 'PHONE') {
      if (!args.quantity || args.quantity < 1 || initialUnits.length !== args.quantity) {
        throw new AppError('حدد كمية الهاتف وأدخل IMEI لكل جهاز');
      }
      const imeis = initialUnits.map((unit) => unit.imei1.trim());
      if (new Set(imeis).size !== imeis.length) throw new AppError('لا يمكن تكرار رقم IMEI');
      const existing = await db().phoneUnit.findFirst({ where: { OR: [{ imei1: { in: imeis } }, { imei2: { in: initialUnits.map((unit) => unit.imei2?.trim()).filter(Boolean) as string[] } }] } });
      if (existing) throw new AppError(`رقم IMEI «${existing.imei1}» مسجل بالفعل`);
    }
    const data = {
      name: args.name.trim(),
      sku: args.sku?.trim() || null,
      barcode: args.barcode?.trim() || null,
      type: args.type,
      categoryId: args.categoryId ?? null,
      brandId: args.brandId ?? null,
      storageGb: args.storageGb ?? null,
      ramGb: args.ramGb ?? null,
      color: args.color?.trim() || null,
      purchasePrice: unitPurchasePrice,
      sellingPrice: unitSellingPrice,
      minStock: Math.max(0, Math.floor(args.minStock ?? 3)),
      warrantyMonths: args.warrantyMonths ?? null,
      notes: args.notes?.trim() || null,
      isActive: true,
    };
    const product = await db().$transaction(async (tx) => {
      const created = await tx.product.create({ data, include: { category: true, brand: true } });
      const initialQuantity = args.type === 'PHONE' ? initialUnits.length : Math.max(0, Math.floor(args.quantity ?? 0));
      if (initialQuantity > 0) {
        if (args.type === 'PHONE') {
          await tx.phoneUnit.createMany({ data: initialUnits.map((unit) => ({
            productId: created.id, imei1: unit.imei1.trim(), imei2: unit.imei2?.trim() || null,
            serialNumber: unit.serialNumber?.trim() || null, status: 'IN_STOCK',
            purchasePrice: unitPurchasePrice, sellingPrice: unitSellingPrice,
            warrantyMonths: args.warrantyMonths ?? null,
          })) });
        }
        await tx.product.update({ where: { id: created.id }, data: { quantity: initialQuantity } });
        await tx.inventoryMovement.create({ data: {
          productId: created.id, type: 'INITIAL', quantityChange: initialQuantity, balanceAfter: initialQuantity,
          note: 'رصيد افتتاحي', userId: ctx.session?.userId ?? null,
        } });
      }
      await audit(tx, ctx.session, 'إضافة منتج', 'Product', created.id, { name: created.name, initialQuantity });
      return { ...created, quantity: initialQuantity };
    });
    return product;
  });

  register(ipc, 'products:update', ['products', 'phones', 'accessories'], async (a, ctx) => {
    const args = req<'products:update'>(a);
    const product = await db().product.update({
      where: { id: args.id },
      data: {
        ...(args.name != null ? { name: args.name.trim() } : {}),
        ...(args.sku !== undefined ? { sku: args.sku?.trim() || null } : {}),
        ...(args.barcode !== undefined ? { barcode: args.barcode?.trim() || null } : {}),
        ...(args.categoryId !== undefined ? { categoryId: args.categoryId ?? null } : {}),
        ...(args.brandId !== undefined ? { brandId: args.brandId ?? null } : {}),
        ...(args.storageGb !== undefined ? { storageGb: args.storageGb } : {}),
        ...(args.ramGb !== undefined ? { ramGb: args.ramGb } : {}),
        ...(args.color !== undefined ? { color: args.color?.trim() || null } : {}),
        ...(args.purchasePrice != null ? { purchasePrice: Math.floor(args.purchasePrice) } : {}),
        ...(args.sellingPrice != null ? { sellingPrice: Math.floor(args.sellingPrice) } : {}),
        ...(args.minStock != null ? { minStock: Math.max(0, Math.floor(args.minStock)) } : {}),
        ...(args.warrantyMonths !== undefined ? { warrantyMonths: args.warrantyMonths } : {}),
        ...(args.notes !== undefined ? { notes: args.notes?.trim() || null } : {}),
        ...(args.isActive != null ? { isActive: args.isActive } : {}),
      },
      include: { category: true, brand: true },
    });
    await audit(db(), ctx.session, 'تعديل منتج', 'Product', product.id, { name: product.name });
    return product;
  });

  register(ipc, 'products:delete', ['products', 'phones', 'accessories'], async (a, ctx) => {
    const args = req<'products:delete'>(a);
    const [saleItems, purchaseItems] = await Promise.all([
      db().saleItem.count({ where: { productId: args.id } }),
      db().purchaseItem.count({ where: { productId: args.id } }),
    ]);
    if (saleItems > 0 || purchaseItems > 0) {
      throw new AppError('لا يمكن حذف منتج مرتبط بحركات بيع أو شراء — عطّله بدلاً من ذلك');
    }
    await db().product.delete({ where: { id: args.id } });
    await audit(db(), ctx.session, 'حذف منتج', 'Product', args.id);
    return { ok: true };
  });

  register(ipc, 'products:lookup', ['pos', 'products', 'phones', 'accessories', 'sales'], async (a) => {
    const args = req<'products:lookup'>(a);
    const q = (args.query ?? '').trim();
    if (!q) return [];
    const like = `%${q}%`;

    const productsByCode = await db().product.findMany({
      where: { OR: [{ barcode: q }, { sku: q }], isActive: true },
      take: 5,
    });

    const unitMatches = await db().phoneUnit.findMany({
      where: { OR: [{ imei1: q }, { imei2: q }, { serialNumber: q }], status: 'IN_STOCK' },
      take: 5,
      include: { product: true },
    });

    const nameMatches = await db().product.findMany({
      where: {
        isActive: true,
        ...(args.type ? { type: args.type } : {}),
        OR: [{ name: { contains: q , mode: 'insensitive' as const } }, { barcode: { contains: q , mode: 'insensitive' as const } }],
      },
      take: 12,
      orderBy: { name: 'asc' },
    });
    void like;

    const results: { product: typeof nameMatches[number]; matchType: string; unit?: unknown }[] = [];
    const seen = new Set<number>();
    for (const u of unitMatches) {
      if (!seen.has(u.productId)) {
        seen.add(u.productId);
        results.push({ product: u.product, matchType: 'imei', unit: u });
      }
    }
    for (const p of productsByCode) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        results.push({ product: p, matchType: 'barcode' });
      }
    }
    for (const p of nameMatches) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        results.push({ product: p, matchType: 'name' });
      }
    }

    const top = results.slice(0, 15);
    const withUnits = await Promise.all(
      top.map(async (r) => {
        const units = r.product.type === 'PHONE'
          ? await db().phoneUnit.findMany({ where: { productId: r.product.id, status: 'IN_STOCK' }, take: 50 })
          : [];
        return { ...r.product, matchType: r.matchType, unit: r.unit, units };
      })
    );
    return withUnits;
  });

  register(ipc, 'phoneUnits:list', ['phones', 'inventory', 'products'], async (a) => {
    const args = req<'phoneUnits:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.search ? {
        OR: [{ imei1: { contains: args.search , mode: 'insensitive' as const } }, { imei2: { contains: args.search , mode: 'insensitive' as const } }, { serialNumber: { contains: args.search , mode: 'insensitive' as const } }],
      } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.productId ? { productId: args.productId } : {}),
    };
    const [data, total] = await Promise.all([
      db().phoneUnit.findMany({ where, include: { product: true }, orderBy: { id: 'desc' }, skip, take }),
      db().phoneUnit.count({ where }),
    ]);
    return { data, total, page, pageSize };
  });

  register(ipc, 'phoneUnits:setStatus', ['phones', 'inventory'], async (a, ctx) => {
    const args = req<'phoneUnits:setStatus'>(a);
    const unit = await db().phoneUnit.findUnique({ where: { id: args.id } });
    if (!unit) throw new AppError('الجهاز غير موجود');
    if (unit.status === 'SOLD' && args.status !== 'SOLD') {
      throw new AppError('لا يمكن تغيير حالة جهاز مبيع — استخدم المرتجعات');
    }
    const before = unit.status;
    const updated = await db().phoneUnit.update({
      where: { id: args.id },
      data: { status: args.status },
      include: { product: true },
    });
    // مزامنة كمية المنتج عند التغيير بين متوفر/تالف
    if (before === 'IN_STOCK' && args.status !== 'IN_STOCK') {
      await db().product.update({ where: { id: unit.productId }, data: { quantity: { decrement: 1 } } });
    } else if (before !== 'IN_STOCK' && args.status === 'IN_STOCK') {
      await db().product.update({ where: { id: unit.productId }, data: { quantity: { increment: 1 } } });
    }
    await audit(db(), ctx.session, 'تغيير حالة جهاز', 'PhoneUnit', unit.id, { from: before, to: args.status });
    return updated;
  });

  register(ipc, 'phoneUnits:add', ['phones', 'inventory', 'products'], async (a, ctx) => {
    const args = req<'phoneUnits:add'>(a);
    const product = await db().product.findUnique({ where: { id: args.productId } });
    if (!product || product.type !== 'PHONE') throw new AppError('المنتج غير موجود أو ليس هاتفاً');
    
    let providedImeis = (args.imeis ?? []).filter(Boolean);
    if (new Set(providedImeis).size !== providedImeis.length) {
      throw new AppError('لا يمكن تكرار رقم IMEI في القائمة المُدخلة');
    }
    
    if (providedImeis.length > 0) {
      const existing = await db().phoneUnit.findFirst({ where: { imei1: { in: providedImeis } } });
      if (existing) throw new AppError(`الجهاز ذو IMEI (${existing.imei1}) مسجل مسبقاً`);
    }

    const unitsToCreate: { productId: number; imei1: string; status: string; purchasePrice: number; sellingPrice: number; warrantyMonths: number | null }[] = [];
    for (let i = 0; i < args.quantity; i++) {
      let imei = providedImeis[i];
      if (!imei) {
        imei = `AUTO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      }
      unitsToCreate.push({
        productId: product.id,
        imei1: imei,
        status: 'IN_STOCK',
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        warrantyMonths: product.warrantyMonths ?? null,
      });
    }

    await db().$transaction(async (tx) => {
      await tx.phoneUnit.createMany({ data: unitsToCreate });
      await tx.product.update({ where: { id: product.id }, data: { quantity: { increment: args.quantity } } });
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: 'ADJUSTMENT',
          quantityChange: args.quantity,
          balanceAfter: product.quantity + args.quantity,
          note: 'إضافة أجهزة يدوياً',
          userId: ctx.session!.userId,
        }
      });
    });
    await audit(db(), ctx.session, 'إضافة أجهزة', 'Product', product.id, { quantity: args.quantity });
    return { ok: true };
  });

  register(ipc, 'phoneUnits:remove', ['phones', 'inventory', 'products'], async (a, ctx) => {
    const args = req<'phoneUnits:remove'>(a);
    const units = await db().phoneUnit.findMany({ where: { id: { in: args.unitIds }, status: 'IN_STOCK' }, include: { product: true } });
    
    if (units.length === 0) return { ok: true };
    const productId = units[0].productId;
    const product = await db().product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('المنتج غير موجود');

    await db().$transaction(async (tx) => {
      await tx.phoneUnit.updateMany({
        where: { id: { in: units.map(u => u.id) } },
        data: { status: 'DEFECTIVE' }
      });
      await tx.product.update({
        where: { id: productId },
        data: { quantity: { decrement: units.length } }
      });
      await tx.inventoryMovement.create({
        data: {
          productId: productId,
          type: 'DAMAGE',
          quantityChange: -units.length,
          balanceAfter: product.quantity - units.length,
          note: 'إزالة أجهزة يدوياً',
          userId: ctx.session!.userId,
        }
      });
    });
    
    await audit(db(), ctx.session, 'إزالة أجهزة', 'Product', productId, { count: units.length });
    return { ok: true };
  });

  register(ipc, 'phoneUnits:update', ['phones', 'inventory'], async (a, ctx) => {
    const args = req<'phoneUnits:update'>(a);
    const unit = await db().phoneUnit.findUnique({ where: { id: args.id } });
    if (!unit) throw new AppError('الجهاز غير موجود');
    const updated = await db().phoneUnit.update({
      where: { id: args.id },
      data: { 
        imei1: args.imei1.trim(), 
        imei2: args.imei2?.trim() || null, 
        serialNumber: args.serialNumber?.trim() || null 
      },
      include: { product: true },
    });
    await audit(db(), ctx.session, 'تعديل بيانات جهاز', 'PhoneUnit', unit.id, { before: { imei1: unit.imei1 }, after: { imei1: args.imei1 } });
    return updated;
  });

  // التصنيفات والماركات
  register(ipc, 'categories:list', null, async () => {
    const cats = await db().category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    return cats.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products }));
  });
  register(ipc, 'categories:create', 'products', async (a) => {
    const args = req<'categories:create'>(a);
    if (!args.name?.trim()) throw new AppError('أدخل اسم التصنيف');
    return db().category.create({ data: { name: args.name.trim() } });
  });
  register(ipc, 'categories:update', 'products', async (a) => {
    const args = req<'categories:update'>(a);
    return db().category.update({ where: { id: args.id }, data: { name: args.name.trim() } });
  });
  register(ipc, 'categories:delete', 'products', async (a) => {
    const args = req<'categories:delete'>(a);
    const count = await db().product.count({ where: { categoryId: args.id } });
    if (count > 0) throw new AppError('لا يمكن حذف تصنيف مرتبط بمنتجات');
    await db().category.delete({ where: { id: args.id } });
    return { ok: true };
  });

  register(ipc, 'brands:list', null, async () => {
    const brands = await db().brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    return brands.map((b) => ({ id: b.id, name: b.name, productCount: b._count.products }));
  });
  register(ipc, 'brands:create', 'products', async (a) => {
    const args = req<'brands:create'>(a);
    if (!args.name?.trim()) throw new AppError('أدخل اسم الماركة');
    return db().brand.create({ data: { name: args.name.trim() } });
  });
  register(ipc, 'brands:update', 'products', async (a) => {
    const args = req<'brands:update'>(a);
    return db().brand.update({ where: { id: args.id }, data: { name: args.name.trim() } });
  });
  register(ipc, 'brands:delete', 'products', async (a) => {
    const args = req<'brands:delete'>(a);
    const count = await db().product.count({ where: { brandId: args.id } });
    if (count > 0) throw new AppError('لا يمكن حذف ماركة مرتبطة بمنتجات');
    await db().brand.delete({ where: { id: args.id } });
    return { ok: true };
  });

  // ─────────────── المخزون ───────────────
  register(ipc, 'inventory:movements', 'inventory', async (a) => {
    const args = req<'inventory:movements'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.productId ? { productId: args.productId } : {}),
      ...(args.type ? { type: args.type } : {}),
      ...(args.from || args.to ? {
        createdAt: {
          ...(args.from ? { gte: parseDate(args.from, new Date(0)) } : {}),
          ...(args.to ? { lt: addDays(parseDate(args.to, new Date()), 1) } : {}),
        },
      } : {}),
    };
    const [data, total] = await Promise.all([
      db().inventoryMovement.findMany({
        where, include: { product: true, user: { select: { id: true, fullName: true } } },
        orderBy: { id: 'desc' }, skip, take,
      }),
      db().inventoryMovement.count({ where }),
    ]);
    return { data, total, page, pageSize };
  });

  register(ipc, 'inventory:adjust', 'inventory', async (a, ctx) => {
    const args = req<'inventory:adjust'>(a);
    const product = await db().product.findUnique({ where: { id: args.productId } });
    if (!product) throw new AppError('المنتج غير موجود');
    if (product.type === 'PHONE') throw new AppError('كميات الهواتف تُدار تلقائياً عبر أجهزة الـ IMEI');
    const current = product.quantity;
    let newQty: number;
    if (args.change != null) {
      newQty = current + Math.floor(args.change);
    } else if (args.newQuantity != null) {
      newQty = Math.floor(args.newQuantity);
    } else {
      throw new AppError('حدد الكمية الجديدة أو مقدار التغيير');
    }
    if (newQty < 0) throw new AppError('لا يمكن أن تكون الكمية أقل من صفر');
    await db().$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { quantity: newQty } });
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: args.type === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT',
          quantityChange: newQty - current,
          balanceAfter: newQty,
          note: args.reason ?? 'تعديل يدوي للمخزون',
          userId: ctx.session?.userId ?? null,
        },
      });
    });
    await audit(db(), ctx.session, 'تعديل مخزون', 'Product', product.id, { from: current, to: newQty });
    return db().product.findUnique({ where: { id: product.id }, include: { category: true, brand: true } });
  });

  register(ipc, 'inventory:valuation', ['inventory', 'reports', 'dashboard'], async () => {
    return reports.inventoryReport(db());
  });

  // ─────────────── المبيعات ───────────────
  register(ipc, 'sales:create', ['pos', 'sales'], async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    return createSale(db(), req<'sales:create'>(a), ctx.session);
  });

  register(ipc, 'sales:list', ['sales', 'invoices', 'dashboard'], async (a) => {
    const args = req<'sales:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.search ? {
        OR: [{ invoiceNumber: { contains: args.search , mode: 'insensitive' as const } }, { customer: { name: { contains: args.search , mode: 'insensitive' as const } } }],
      } : {}),
      ...(args.customerId ? { customerId: args.customerId } : {}),
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.from || args.to ? {
        createdAt: {
          ...(args.from ? { gte: parseDate(args.from, new Date(0)) } : {}),
          ...(args.to ? { lt: addDays(parseDate(args.to, new Date()), 1) } : {}),
        },
      } : {}),
    };
    const [sales, total] = await Promise.all([
      db().sale.findMany({ where, include: { items: true, customer: true, user: true }, orderBy: { id: 'desc' }, skip, take }),
      db().sale.count({ where }),
    ]);
    return { data: sales.map(toSaleRow), total, page, pageSize };
  });

  register(ipc, 'sales:get', ['sales', 'invoices', 'returns', 'pos', 'customers'], async (a) => {
    const args = req<'sales:get'>(a);
    const sale = await db().sale.findUnique({
      where: { id: args.id },
      include: {
        items: true, payments: true, customer: true, user: true,
        returns: { include: { items: true } },
      },
    });
    if (!sale) throw new AppError('الفاتورة غير موجودة');
    const itemIds = sale.items.map((i) => i.id);
    const units = itemIds.length
      ? await db().phoneUnit.findMany({ where: { saleItemId: { in: itemIds } } })
      : [];
    const items = sale.items.map((item) => ({
      ...item,
      phoneUnits: units.filter((u) => u.saleItemId === item.id),
    }));
    return { ...sale, items, profit: saleProfit(sale) };
  });

  register(ipc, 'sales:delete', 'sales', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    return deleteSale(db(), req<'sales:delete'>(a).id, ctx.session);
  });

  register(ipc, 'sales:addPayment', ['sales', 'customers', 'invoices'], async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'sales:addPayment'>(a);
    return addSalePayment(db(), args.saleId, args.amount, args.method, args.note, ctx.session);
  });

  register(ipc, 'customers:payDebt', ['customers', 'treasury', 'sales'], async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'customers:payDebt'>(a);
    return db().$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: args.customerId } });
      if (!customer) throw new AppError('العميل غير موجود');
      if (args.amount <= 0) throw new AppError('أدخل مبلغاً صحيحاً');
      const debt = await customerDebt(tx, customer.id);
      if (args.amount > debt) throw new AppError(`المبلغ يتجاوز دين العميل (${debt})`);
      const payment = await tx.payment.create({
        data: {
          kind: 'CUSTOMER', customerId: customer.id, amount: args.amount,
          method: args.method, note: args.note ?? 'سداد دفعة دين', userId: ctx.session!.userId,
        },
      });
      await createTreasuryTx(tx, {
        direction: 'IN', type: 'CUSTOMER_PAYMENT', amount: args.amount, method: args.method,
        referenceType: 'PAYMENT', referenceId: payment.id,
        note: `سداد دين العميل ${customer.name}`, userId: ctx.session!.userId,
      });
      await audit(tx, ctx.session, 'تحصيل دين عميل', 'Customer', customer.id, { amount: args.amount });
      return { ok: true, debt: debt - args.amount };
    });
  });

  // ─────────────── المشتريات ───────────────
  register(ipc, 'purchases:create', 'purchases', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    return createPurchase(db(), req<'purchases:create'>(a), ctx.session);
  });

  register(ipc, 'purchases:list', ['purchases', 'invoices', 'dashboard'], async (a) => {
    const args = req<'purchases:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.search ? {
        OR: [{ invoiceNumber: { contains: args.search , mode: 'insensitive' as const } }, { supplier: { name: { contains: args.search , mode: 'insensitive' as const } } }],
      } : {}),
      ...(args.supplierId ? { supplierId: args.supplierId } : {}),
      ...(args.from || args.to ? {
        createdAt: {
          ...(args.from ? { gte: parseDate(args.from, new Date(0)) } : {}),
          ...(args.to ? { lt: addDays(parseDate(args.to, new Date()), 1) } : {}),
        },
      } : {}),
    };
    const [purchases, total] = await Promise.all([
      db().purchase.findMany({ where, include: { items: true, supplier: true, user: true }, orderBy: { id: 'desc' }, skip, take }),
      db().purchase.count({ where }),
    ]);
    return { data: purchases.map(toPurchaseRow), total, page, pageSize };
  });

  register(ipc, 'purchases:get', ['purchases', 'returns', 'invoices', 'suppliers'], async (a) => {
    const args = req<'purchases:get'>(a);
    const purchase = await db().purchase.findUnique({
      where: { id: args.id },
      include: { items: true, payments: true, supplier: true, user: true, returns: { include: { items: true } } },
    });
    if (!purchase) throw new AppError('الفاتورة غير موجودة');
    const itemIds = purchase.items.map((i) => i.id);
    const units = itemIds.length
      ? await db().phoneUnit.findMany({ where: { purchaseItemId: { in: itemIds }, status: { in: ['IN_STOCK', 'RETURNED', 'DEFECTIVE'] } } })
      : [];
    return {
      ...purchase,
      items: purchase.items.map((item) => ({
        ...item,
        phoneUnits: units.filter((u) => u.purchaseItemId === item.id),
      })),
    };
  });

  register(ipc, 'purchases:delete', 'purchases', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    return deletePurchase(db(), req<'purchases:delete'>(a).id, ctx.session);
  });

  register(ipc, 'purchases:addPayment', ['purchases', 'suppliers'], async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'purchases:addPayment'>(a);
    return addPurchasePayment(db(), args.purchaseId, args.amount, args.method, args.note, ctx.session);
  });

  register(ipc, 'suppliers:payDebt', ['suppliers', 'treasury', 'purchases'], async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'suppliers:payDebt'>(a);
    return db().$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: args.supplierId } });
      if (!supplier) throw new AppError('المورد غير موجود');
      if (args.amount <= 0) throw new AppError('أدخل مبلغاً صحيحاً');
      const balance = await supplierBalance(tx, supplier.id);
      if (args.amount > balance) throw new AppError(`المبلغ يتجاوز الذمة المتبقية (${balance})`);
      const payment = await tx.payment.create({
        data: {
          kind: 'SUPPLIER', supplierId: supplier.id, amount: args.amount,
          method: args.method, note: args.note ?? 'سداد دفعة لمورد', userId: ctx.session!.userId,
        },
      });
      await createTreasuryTx(tx, {
        direction: 'OUT', type: 'SUPPLIER_PAYMENT', amount: args.amount, method: args.method,
        referenceType: 'PAYMENT', referenceId: payment.id,
        note: `سداد ذمة المورد ${supplier.name}`, userId: ctx.session!.userId,
      });
      await audit(tx, ctx.session, 'سداد دفعة لمورد', 'Supplier', supplier.id, { amount: args.amount });
      return { ok: true, balance: balance - args.amount };
    });
  });

  // ─────────────── العملاء ───────────────
  register(ipc, 'customers:list', ['customers', 'sales', 'pos'], async (a) => {
    const args = req<'customers:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.search ? { OR: [{ name: { contains: args.search , mode: 'insensitive' as const } }, { phone: { contains: args.search , mode: 'insensitive' as const } }] } : {}),
    };
    const [customers, total] = await Promise.all([
      db().customer.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      db().customer.count({ where }),
    ]);
    // ديون ومجاميع العملاء في هذه الصفحة
    const ids = customers.map((c) => c.id);
    const salesAgg = ids.length ? await db().sale.groupBy({
      by: ['customerId'], where: { customerId: { in: ids } },
      _sum: { total: true, returnedAmount: true }, _count: { _all: true },
    }) : [];
    const payAgg = ids.length ? await db().payment.groupBy({
      by: ['customerId'], where: { customerId: { in: ids } }, _sum: { amount: true },
    }) : [];
    const data = customers.map((c) => {
      const s = salesAgg.find((g) => g.customerId === c.id);
      const paid = payAgg.find((g) => g.customerId === c.id)?._sum.amount ?? 0;
      const totalBought = (s?._sum.total ?? 0) - (s?._sum.returnedAmount ?? 0);
      return {
        ...c,
        debt: totalBought - paid,
        salesCount: s?._count._all ?? 0,
        totalPurchases: totalBought,
      };
    });
    if (args.withDebt) {
      const filtered = data.filter((c) => c.debt > 0);
      return { data: filtered, total, page, pageSize };
    }
    return { data, total, page, pageSize };
  });

  register(ipc, 'customers:get', ['customers', 'sales'], async (a) => {
    const args = req<'customers:get'>(a);
    const customer = await db().customer.findUnique({ where: { id: args.id } });
    if (!customer) throw new AppError('العميل غير موجود');
    const sales = await db().sale.findMany({
      where: { customerId: args.id }, include: { items: true }, orderBy: { id: 'desc' }, take: 50,
    });
    const payments = await db().payment.findMany({
      where: { customerId: args.id }, include: { user: true }, orderBy: { id: 'desc' }, take: 50,
    });
    return { ...customer, sales: sales.map(toSaleRow), payments, debt: await customerDebt(db(), args.id) };
  });

  register(ipc, 'customers:create', ['customers', 'sales', 'pos'], async (a, ctx) => {
    const args = req<'customers:create'>(a);
    if (!args.name?.trim()) throw new AppError('أدخل اسم العميل');
    const customer = await db().customer.create({
      data: { name: args.name.trim(), phone: args.phone?.trim() || null, address: args.address?.trim() || null, notes: args.notes?.trim() || null },
    });
    await audit(db(), ctx.session, 'إضافة عميل', 'Customer', customer.id, { name: customer.name });
    return customer;
  });

  register(ipc, 'customers:update', 'customers', async (a, ctx) => {
    const args = req<'customers:update'>(a);
    const customer = await db().customer.update({
      where: { id: args.id },
      data: {
        name: args.name?.trim(),
        ...(args.phone !== undefined ? { phone: args.phone?.trim() || null } : {}),
        ...(args.address !== undefined ? { address: args.address?.trim() || null } : {}),
        ...(args.notes !== undefined ? { notes: args.notes?.trim() || null } : {}),
        ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      },
    });
    await audit(db(), ctx.session, 'تعديل عميل', 'Customer', customer.id);
    return customer;
  });

  register(ipc, 'customers:delete', 'customers', async (a, ctx) => {
    const args = req<'customers:delete'>(a);
    const [salesCount, payCount] = await Promise.all([
      db().sale.count({ where: { customerId: args.id } }),
      db().payment.count({ where: { customerId: args.id } }),
    ]);
    if (salesCount > 0 || payCount > 0) throw new AppError('لا يمكن حذف عميل له سجل فواتير أو مدفوعات');
    await db().customer.delete({ where: { id: args.id } });
    await audit(db(), ctx.session, 'حذف عميل', 'Customer', args.id);
    return { ok: true };
  });

  // ─────────────── الموردون ───────────────
  register(ipc, 'suppliers:list', 'suppliers', async (a) => {
    const args = req<'suppliers:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.search ? { OR: [{ name: { contains: args.search , mode: 'insensitive' as const } }, { phone: { contains: args.search , mode: 'insensitive' as const } }] } : {}),
    };
    const [suppliers, total] = await Promise.all([
      db().supplier.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      db().supplier.count({ where }),
    ]);
    const ids = suppliers.map((s) => s.id);
    const purAgg = ids.length ? await db().purchase.groupBy({
      by: ['supplierId'], where: { supplierId: { in: ids } },
      _sum: { total: true, returnedAmount: true }, _count: { _all: true },
    }) : [];
    const payAgg = ids.length ? await db().payment.groupBy({
      by: ['supplierId'], where: { supplierId: { in: ids } }, _sum: { amount: true },
    }) : [];
    const data = suppliers.map((s) => {
      const p = purAgg.find((g) => g.supplierId === s.id);
      const paid = payAgg.find((g) => g.supplierId === s.id)?._sum.amount ?? 0;
      const totalPurchased = (p?._sum.total ?? 0) - (p?._sum.returnedAmount ?? 0);
      return {
        ...s,
        balance: totalPurchased - paid,
        purchasesCount: p?._count._all ?? 0,
        totalPurchases: totalPurchased,
      };
    });
    if (args.withDebt) {
      return { data: data.filter((s) => s.balance !== 0), total, page, pageSize };
    }
    return { data, total, page, pageSize };
  });

  register(ipc, 'suppliers:get', 'suppliers', async (a) => {
    const args = req<'suppliers:get'>(a);
    const supplier = await db().supplier.findUnique({ where: { id: args.id } });
    if (!supplier) throw new AppError('المورد غير موجود');
    const purchases = await db().purchase.findMany({
      where: { supplierId: args.id }, include: { items: true }, orderBy: { id: 'desc' }, take: 50,
    });
    const payments = await db().payment.findMany({
      where: { supplierId: args.id }, include: { user: true }, orderBy: { id: 'desc' }, take: 50,
    });
    return { ...supplier, purchases: purchases.map(toPurchaseRow), payments, balance: await supplierBalance(db(), args.id) };
  });

  register(ipc, 'suppliers:create', ['suppliers', 'purchases'], async (a, ctx) => {
    const args = req<'suppliers:create'>(a);
    if (!args.name?.trim()) throw new AppError('أدخل اسم المورد');
    const supplier = await db().supplier.create({
      data: { name: args.name.trim(), phone: args.phone?.trim() || null, address: args.address?.trim() || null, notes: args.notes?.trim() || null },
    });
    await audit(db(), ctx.session, 'إضافة مورد', 'Supplier', supplier.id, { name: supplier.name });
    return supplier;
  });

  register(ipc, 'suppliers:update', 'suppliers', async (a, ctx) => {
    const args = req<'suppliers:update'>(a);
    const supplier = await db().supplier.update({
      where: { id: args.id },
      data: {
        name: args.name?.trim(),
        ...(args.phone !== undefined ? { phone: args.phone?.trim() || null } : {}),
        ...(args.address !== undefined ? { address: args.address?.trim() || null } : {}),
        ...(args.notes !== undefined ? { notes: args.notes?.trim() || null } : {}),
        ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      },
    });
    await audit(db(), ctx.session, 'تعديل مورد', 'Supplier', supplier.id);
    return supplier;
  });

  register(ipc, 'suppliers:delete', 'suppliers', async (a, ctx) => {
    const args = req<'suppliers:delete'>(a);
    const count = await db().purchase.count({ where: { supplierId: args.id } });
    if (count > 0) throw new AppError('لا يمكن حذف مورد له فواتير شراء');
    await db().supplier.delete({ where: { id: args.id } });
    await audit(db(), ctx.session, 'حذف مورد', 'Supplier', args.id);
    return { ok: true };
  });

  // ─────────────── المصروفات ───────────────
  register(ipc, 'expenses:list', 'expenses', async (a) => {
    const args = req<'expenses:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args.from || args.to ? {
        createdAt: {
          ...(args.from ? { gte: parseDate(args.from, new Date(0)) } : {}),
          ...(args.to ? { lt: addDays(parseDate(args.to, new Date()), 1) } : {}),
        },
      } : {}),
    };
    const [data, total, sum] = await Promise.all([
      db().expense.findMany({ where, include: { category: true, user: true }, orderBy: { id: 'desc' }, skip, take }),
      db().expense.count({ where }),
      db().expense.aggregate({ _sum: { amount: true }, where }),
    ]);
    return { data, total: sum._sum.amount ?? total, page, pageSize, count: total } as never;
  });

  register(ipc, 'expenses:create', 'expenses', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'expenses:create'>(a);
    if (!args.amount || args.amount <= 0) throw new AppError('أدخل مبلغاً صحيحاً');
    return db().$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId: args.categoryId, amount: Math.floor(args.amount),
          description: args.description?.trim() || null, method: args.method, userId: ctx.session!.userId,
        },
        include: { category: true, user: true },
      });
      await tx.treasuryTransaction.create({
        data: {
          direction: 'OUT', type: 'EXPENSE', amount: expense.amount, method: expense.method,
          referenceType: 'EXPENSE', referenceId: expense.id, userId: ctx.session!.userId,
        },
      });
      await audit(tx, ctx.session, 'تسجيل مصروف', 'Expense', expense.id, { amount: expense.amount });
      return expense;
    });
  });

  register(ipc, 'expenses:update', 'expenses', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'expenses:update'>(a);
    return db().$transaction(async (tx) => {
      const old = await tx.expense.findUnique({ where: { id: args.id } });
      if (!old) throw new AppError('المصروف غير موجود');
      await tx.treasuryTransaction.deleteMany({ where: { referenceType: 'EXPENSE', referenceId: old.id } });
      const expense = await tx.expense.update({
        where: { id: args.id },
        data: {
          categoryId: args.categoryId, amount: Math.floor(args.amount),
          description: args.description?.trim() || null, method: args.method,
        },
        include: { category: true, user: true },
      });
      await tx.treasuryTransaction.create({
        data: {
          direction: 'OUT', type: 'EXPENSE', amount: expense.amount, method: expense.method,
          referenceType: 'EXPENSE', referenceId: expense.id, userId: ctx.session!.userId,
        },
      });
      await audit(tx, ctx.session, 'تعديل مصروف', 'Expense', expense.id, { amount: expense.amount });
      return expense;
    });
  });

  register(ipc, 'expenses:delete', 'expenses', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'expenses:delete'>(a);
    return db().$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id: args.id } });
      if (!expense) throw new AppError('المصروف غير موجود');
      await tx.treasuryTransaction.deleteMany({ where: { referenceType: 'EXPENSE', referenceId: expense.id } });
      await tx.expense.delete({ where: { id: expense.id } });
      await audit(tx, ctx.session, 'حذف مصروف', 'Expense', expense.id, { amount: expense.amount });
      return { ok: true };
    });
  });

  register(ipc, 'expenseCategories:list', 'expenses', async () => {
    const cats = await db().expenseCategory.findMany({ include: { _count: { select: { expenses: true } } }, orderBy: { id: 'asc' } });
    return cats.map((c) => ({ id: c.id, name: c.name, isSystem: c.isSystem, usageCount: c._count.expenses }));
  });
  register(ipc, 'expenseCategories:create', 'expenses', async (a) => {
    const args = req<'expenseCategories:create'>(a);
    if (!args.name?.trim()) throw new AppError('أدخل اسم التصنيف');
    return db().expenseCategory.create({ data: { name: args.name.trim() } });
  });
  register(ipc, 'expenseCategories:update', 'expenses', async (a) => {
    const args = req<'expenseCategories:update'>(a);
    return db().expenseCategory.update({ where: { id: args.id }, data: { name: args.name.trim() } });
  });
  register(ipc, 'expenseCategories:delete', 'expenses', async (a) => {
    const args = req<'expenseCategories:delete'>(a);
    const count = await db().expense.count({ where: { categoryId: args.id } });
    if (count > 0) throw new AppError('لا يمكن حذف تصنيف مرتبط بمصروفات');
    await db().expenseCategory.delete({ where: { id: args.id } });
    return { ok: true };
  });

  // ─────────────── الصندوق ───────────────
  register(ipc, 'treasury:list', 'treasury', async (a) => {
    const args = req<'treasury:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.direction ? { direction: args.direction } : {}),
      ...(args.type ? { type: args.type } : {}),
      ...(args.from || args.to ? {
        createdAt: {
          ...(args.from ? { gte: parseDate(args.from, new Date(0)) } : {}),
          ...(args.to ? { lt: addDays(parseDate(args.to, new Date()), 1) } : {}),
        },
      } : {}),
    };
    const [data, total, sumIn, sumOut] = await Promise.all([
      db().treasuryTransaction.findMany({ where, include: { user: true }, orderBy: { id: 'desc' }, skip, take }),
      db().treasuryTransaction.count({ where }),
      db().treasuryTransaction.aggregate({ _sum: { amount: true }, where: { ...where, direction: 'IN' } }),
      db().treasuryTransaction.aggregate({ _sum: { amount: true }, where: { ...where, direction: 'OUT' } }),
    ]);
    return { data, total, page, pageSize, sumIn: sumIn._sum.amount ?? 0, sumOut: sumOut._sum.amount ?? 0 } as never;
  });

  register(ipc, 'treasury:summary', ['treasury', 'reports', 'dashboard'], async (a) => {
    const args = req<'treasury:summary'>(a);
    const from = args.from ? parseDate(args.from, new Date(0)) : undefined;
    const to = args.to ? addDays(parseDate(args.to, new Date()), 1) : undefined;
    return reports.treasuryReport(db(), from, to);
  });

  register(ipc, 'treasury:manual', 'treasury', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    const args = req<'treasury:manual'>(a);
    if (!args.amount || args.amount <= 0) throw new AppError('أدخل مبلغاً صحيحاً');
    const direction = args.type === 'WITHDRAWAL' || args.type === 'OTHER_EXPENSE' ? 'OUT' : 'IN';
    const tx = await db().treasuryTransaction.create({
      data: {
        direction, type: args.type, amount: Math.floor(args.amount), method: args.method,
        note: args.note?.trim() || null, userId: ctx.session.userId,
      },
      include: { user: true },
    });
    await audit(db(), ctx.session, 'حركة صندوق يدوية', 'Treasury', tx.id, { type: args.type, amount: args.amount });
    return tx;
  });

  // ─────────────── المرتجعات ───────────────
  register(ipc, 'returns:create', 'returns', async (a, ctx) => {
    if (!ctx.session) throw new AppError('انتهت الجلسة');
    return createReturn(db(), req<'returns:create'>(a), ctx.session);
  });

  register(ipc, 'returns:list', 'returns', async (a) => {
    const args = req<'returns:list'>(a);
    const { skip, take, page, pageSize } = paginate(args);
    const where = {
      ...(args.type ? { type: args.type } : {}),
      ...(args.search ? { invoiceNumber: { contains: args.search , mode: 'insensitive' as const } } : {}),
      ...(args.from || args.to ? {
        createdAt: {
          ...(args.from ? { gte: parseDate(args.from, new Date(0)) } : {}),
          ...(args.to ? { lt: addDays(parseDate(args.to, new Date()), 1) } : {}),
        },
      } : {}),
    };
    const [data, total] = await Promise.all([
      db().return.findMany({
        where,
        include: { sale: { select: { invoiceNumber: true } }, purchase: { select: { invoiceNumber: true } }, customer: true, supplier: true, user: true },
        orderBy: { id: 'desc' }, skip, take,
      }),
      db().return.count({ where }),
    ]);
    return {
      data: data.map((r) => ({
        ...r,
        saleInvoice: r.sale?.invoiceNumber ?? null,
        purchaseInvoice: r.purchase?.invoiceNumber ?? null,
        sale: undefined, purchase: undefined,
      })),
      total, page, pageSize,
    };
  });

  register(ipc, 'returns:get', 'returns', async (a) => {
    const args = req<'returns:get'>(a);
    const ret = await db().return.findUnique({
      where: { id: args.id },
      include: { items: true, sale: true, purchase: true, customer: true, supplier: true, user: true },
    });
    if (!ret) throw new AppError('المرتجع غير موجود');
    return ret;
  });

  // ─────────────── التقارير ───────────────
  register(ipc, 'reports:dashboard', ['dashboard', 'reports'], async () => reports.getDashboard(db()));

  register(ipc, 'reports:sales', 'reports', async (a) => {
    const args = req<'reports:sales'>(a);
    return reports.salesReport(db(), parseDate(args.from, new Date(0)), addDays(parseDate(args.to, new Date()), 1));
  });

  register(ipc, 'reports:purchases', 'reports', async (a) => {
    const args = req<'reports:purchases'>(a);
    return reports.purchasesReport(db(), parseDate(args.from, new Date(0)), addDays(parseDate(args.to, new Date()), 1));
  });

  register(ipc, 'reports:products', 'reports', async (a) => {
    const args = req<'reports:products'>(a);
    return reports.productsReport(db(), parseDate(args.from, new Date(0)), addDays(parseDate(args.to, new Date()), 1));
  });

  register(ipc, 'reports:employees', 'reports', async (a) => {
    const args = req<'reports:employees'>(a);
    return reports.employeesReport(db(), parseDate(args.from, new Date(0)), addDays(parseDate(args.to, new Date()), 1));
  });

  register(ipc, 'reports:treasury', ['reports', 'treasury'], async (a) => {
    const args = req<'reports:treasury'>(a);
    return reports.treasuryReport(db(), parseDate(args.from, new Date(0)), addDays(parseDate(args.to, new Date()), 1));
  });

  register(ipc, 'reports:debts', ['reports', 'treasury', 'dashboard'], async () => reports.debtsReport(db()));

  register(ipc, 'reports:inventory', ['reports', 'inventory'], async () => reports.inventoryReport(db()));

  // ─────────────── الإعدادات ───────────────
  register(ipc, 'settings:get', null, async (): Promise<AppSettings> => {
    const rows = await db().setting.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      storeName: map.storeName ?? DEFAULT_SETTINGS.storeName,
      storePhone: map.storePhone ?? '',
      storeAddress: map.storeAddress ?? '',
      currency: map.currency ?? DEFAULT_SETTINGS.currency,
      invoiceFooter: map.invoiceFooter ?? DEFAULT_SETTINGS.invoiceFooter,
      lowStockThreshold: parseInt(map.lowStockThreshold ?? '3', 10) || 3,
      autoBackup: (map.autoBackup ?? 'true') === 'true',
      autoBackupIntervalHours: parseInt(map.autoBackupIntervalHours ?? '12', 10) || 12,
      printerWidth: (map.printerWidth === 'A4' ? 'A4' : '80mm'),
      taxEnabled: (map.taxEnabled ?? 'false') === 'true',
      taxRate: parseFloat(map.taxRate ?? '0') || 0,
    };
  });

  register(ipc, 'settings:set', 'settings', async (a, ctx) => {
    const args = req<'settings:set'>(a);
    const entries = Object.entries(args).map(([key, value]) => [key, String(value)] as const);
    await db().$transaction(
      entries.map(([key, value]) =>
        db().setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );
    await audit(db(), ctx.session, 'تعديل الإعدادات', 'Settings', undefined, args);
    const map = Object.fromEntries((await db().setting.findMany()).map((r) => [r.key, r.value]));
    return {
      storeName: map.storeName ?? DEFAULT_SETTINGS.storeName,
      storePhone: map.storePhone ?? '',
      storeAddress: map.storeAddress ?? '',
      currency: map.currency ?? DEFAULT_SETTINGS.currency,
      invoiceFooter: map.invoiceFooter ?? DEFAULT_SETTINGS.invoiceFooter,
      lowStockThreshold: parseInt(map.lowStockThreshold ?? '3', 10) || 3,
      autoBackup: (map.autoBackup ?? 'true') === 'true',
      autoBackupIntervalHours: parseInt(map.autoBackupIntervalHours ?? '12', 10) || 12,
      printerWidth: (map.printerWidth === 'A4' ? 'A4' : '80mm'),
      taxEnabled: (map.taxEnabled ?? 'false') === 'true',
      taxRate: parseFloat(map.taxRate ?? '0') || 0,
    };
  });

  // ─────────────── النسخ الاحتياطي ───────────────
  register(ipc, 'backup:create', 'backup', async (a) => {
    const args = req<'backup:create'>(a);
    return (await import('./backup')).createBackup(args.name);
  });
  register(ipc, 'backup:list', 'backup', async () => (await import('./backup')).listBackups());
  register(ipc, 'backup:dbSize', 'backup', async () => {
    try {
      const result = await db().$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
      return { bytes: Number(result[0]?.size ?? 0) };
    } catch {
      return { bytes: 0 };
    }
  });
  register(ipc, 'backup:validate', 'backup', async (a) => {
    const args = req<'backup:validate'>(a);
    return (await import('./backup')).validateBackup(args.fullPath);
  });
  register(ipc, 'backup:restore', 'backup', async (a) => {
    const args = req<'backup:restore'>(a);
    return (await import('./backup')).restoreBackup(args.fullPath);
  });

  // ─────────────── السجلات والطباعة ───────────────
  register(ipc, 'audit:list', 'settings', async (a) => {
    const args = req<'audit:list'>(a);
    const { skip, take, page, pageSize } = paginate({ ...args, pageSize: args.pageSize ?? 30 });
    const where = args.search ? { OR: [{ action: { contains: args.search , mode: 'insensitive' as const } }, { username: { contains: args.search , mode: 'insensitive' as const } }] } : {};
    const [data, total] = await Promise.all([
      db().auditLog.findMany({ where, orderBy: { id: 'desc' }, skip, take }),
      db().auditLog.count({ where }),
    ]);
    return { data, total, page, pageSize };
  });

  register(ipc, 'print:html', null, async (a) => {
    void req<'print:html'>(a);
    return { ok: true };
  });


  // تمرير نطاق اليوم لأي استخدام مستقبلي
  void today;
  void cashBalance;
}
