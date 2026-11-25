import type { Request, Response, NextFunction } from 'express';
import { accounts } from '@/services/account.service';
import { AppError } from '@/utils/errors';
import { attachPhotoUrls } from '@/services/photo.service';
import { realtimeBus, RealtimeEvents } from '@/services/realtime';

export async function list(req: Request, res: Response, next: NextFunction) {
  try { if (!req.user) throw AppError.unauthorized(); res.json({ data: await attachPhotoUrls(await accounts.list(req.user)) }); }
  catch (err) { next(err); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try { if (!req.user) throw AppError.unauthorized(); res.status(201).json({ data: await accounts.create(req.body, req.user) }); }
  catch (err) { next(err); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try { if (!req.user) throw AppError.unauthorized(); res.json({ data: await accounts.update(req.params.userId, req.body, req.user) }); }
  catch (err) { next(err); }
}
export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const data = await accounts.changeRole(req.params.userId, req.body.role, req.body.position, req.user);
    realtimeBus.emit(RealtimeEvents.ACCOUNT_ACCESS_CHANGED, { userId: data.id });
    res.json({ data });
  } catch (err) { next(err); }
}
export async function setActive(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const data = await accounts.setActive(req.params.userId, req.body.isActive, req.user);
    realtimeBus.emit(RealtimeEvents.ACCOUNT_ACCESS_CHANGED, { userId: data.id });
    res.json({ data });
  } catch (err) { next(err); }
}
