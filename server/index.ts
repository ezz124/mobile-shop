import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { startAutoBackupScheduler } from './core/backup';
import { initDatabase } from './core/database';
import { AppError, toUserMessage } from './core/errors';
import { registerApi, type ApiRegistrar } from './core/ipc';
import type { ApiChannel, IpcResult } from '../src/shared/ipc';
import { validateRequest } from './validation';

const port = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === 'production';
const origin = process.env.WEB_ORIGIN;
const sessionCookie = 'mbile_session';
const handlers = new Map<string, (event: unknown, args: Record<string, unknown>) => Promise<IpcResult<unknown>>>();

const api: ApiRegistrar = {
  handle(channel, listener) {
    handlers.set(channel, listener);
  },
};

async function invoke(req: Request, res: Response): Promise<void> {
  const channel = String(req.params.channel);
  const handler = handlers.get(channel);
  if (!handler) {
    res.status(404).json({ ok: false, error: 'العملية غير موجودة' });
    return;
  }
  try {
    const payload = validateRequest(channel as ApiChannel, req.body);
    const result = await handler({}, { ...payload, token: req.cookies[sessionCookie] } as Record<string, unknown>);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    if (channel === 'auth:login') {
      const login = result.data as { token: string; user: unknown };
      res.cookie(sessionCookie, login.token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      res.status(200).json({ ok: true, data: { user: login.user } });
      return;
    }
    if (channel === 'auth:logout') res.clearCookie(sessionCookie, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
    res.status(200).json(result);
  } catch (error) {
    console.error(`[api:${channel}]`, error);
    const isClientError = error instanceof AppError;
    res.status(isClientError ? 400 : 500).json({ ok: false, error: isClientError ? toUserMessage(error) : 'حدث خطأ غير متوقع في الخادم' });
  }
}

let appInstance: express.Express | null = null;

export async function getApp(): Promise<express.Express> {
  if (appInstance) return appInstance;

  if (!process.env.DATABASE_URL?.startsWith('postgres')) {
    throw new Error('DATABASE_URL يجب أن يكون رابط PostgreSQL قبل تشغيل خادم الويب');
  }

  await initDatabase();
  registerApi(api);

  const app = express();
  if (isProduction && !origin) throw new Error('WEB_ORIGIN مطلوب عند النشر الإنتاجي');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: origin ?? 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  // الجلسة موجودة في Cookie؛ لذلك نرفض أي طلب كتابة لا يأتي من واجهة المتجر الموثوقة.
  app.use('/api', (req, res, next) => {
    if (!isProduction || req.method !== 'POST') return next();
    const requestOrigin = req.get('origin');
    if (!requestOrigin || requestOrigin !== origin) {
      res.status(403).json({ ok: false, error: 'مصدر الطلب غير موثوق' });
      return;
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: 'draft-7', legacyHeaders: false }));
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { ok: false, error: 'محاولات دخول كثيرة — حاول مرة أخرى بعد قليل' } });
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'mbile-erp-api' }));
  app.post('/api/invoke/:channel', (req, res, next) => String(req.params.channel) === 'auth:login' ? loginLimiter(req, res, next) : next(), (req, res) => void invoke(req, res));

  appInstance = app;
  return app;
}

async function main(): Promise<void> {
  const app = await getApp();
  startAutoBackupScheduler();

  // Compiled server lives in server-dist/server; the Vite output is at the project root.
  const dist = path.join(__dirname, '..', '..', 'dist');
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));

  app.listen(port, () => console.log(`Mbile ERP web server listening on :${port}`));
}

if (!process.env.VERCEL) {
  void main().catch((error) => {
    console.error('Web server startup failed:', error);
    process.exitCode = 1;
  });
}
