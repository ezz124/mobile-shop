import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppError } from './errors';
import type { AuthUser, PermissionKey } from '../../src/shared/ipc';

export interface AuthSession {
  userId: number;
  username: string;
  fullName: string;
  roleId: number;
  roleKey: string;
  permissions: PermissionKey[];
  sessionId: number;
}

const SESSION_DAYS = 30;

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function login(db: PrismaClient, username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const user = await db.user.findUnique({
    where: { username: username.trim() },
    include: { role: { include: { permissions: true } } },
  });
  if (!user) throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة');
  if (!user.isActive) throw new AppError('هذا الحساب معطّل — راجع مدير النظام');
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('اسم المستخدم أو كلمة المرور غير صحيحة');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { token, user: toAuthUser(user, user.role.permissions.map((p) => p.permissionKey)) };
}

export function toAuthUser(
  user: Prisma.UserGetPayload<{ include: { role: { include: { permissions: true } } } }> | { id: number; username: string; fullName: string; phone: string | null; roleId: number; role: { id: number; key: string; nameAr: string } | null; isActive: boolean; lastLoginAt: Date | null; createdAt: Date },
  permissions: string[]
): AuthUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    roleId: user.roleId,
    role: user.role ? { id: user.role.id, key: user.role.key, nameAr: user.role.nameAr } : null,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
    permissions: permissions as PermissionKey[],
  };
}

export async function validateSession(db: PrismaClient, token: string): Promise<AuthSession> {
  if (!token) throw new AppError('انتهت الجلسة — يرجى تسجيل الدخول من جديد');
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    throw new AppError('انتهت الجلسة — يرجى تسجيل الدخول من جديد');
  }
  if (!session.user.isActive) throw new AppError('هذا الحساب معطّل');
  return {
    userId: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    roleId: session.user.roleId,
    roleKey: session.user.role.key,
    permissions: session.user.role.permissions.map((p) => p.permissionKey) as PermissionKey[],
    sessionId: session.id,
  };
}

export async function logout(db: PrismaClient, token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
