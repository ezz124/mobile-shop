import type { Request, Response } from 'express';
import { getApp } from '../server/index';

export default async function handler(req: Request, res: Response) {
  const app = await getApp();
  return app(req, res);
}
