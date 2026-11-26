import type { Request, Response, NextFunction } from "express";
import * as residentService from "@/services/resident.service";
import * as notificationService from "@/services/notification.service";
import { AppError } from "@/utils/errors";
import { attachPhotoUrl, attachPhotoUrls, ownPhotoUrl, setResidentPhoto, setUserPhoto } from "@/services/photo.service";
import * as barangayContactService from "@/services/barangay-contact.service";

export async function listBarangayContacts(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    res.status(200).json({ data: await barangayContactService.listBarangayContacts(req.user) });
  } catch (err) { next(err); }
}

export async function saveBarangayContact(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    res.status(200).json({ data: await barangayContactService.saveBarangayContact(req.body, req.user) });
  } catch (err) { next(err); }
}

export async function verifyBarangayContact(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const result = await barangayContactService.verifyBarangayContact(req.params.contactId, req.body.confirmed, req.user);
    res.status(200).json({ data: result });
  } catch (err) { next(err); }
}

/** GET /api/users/profile — the *account holder's* own profile (guardian/official/responder). */
export async function getMyProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    res.status(200).json({ data: { ...req.user, photoUrl: await ownPhotoUrl(req.user.id) } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/users/push-token — registers this device's Expo push token against the signed-in user. */
export async function registerPushToken(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const { deviceId, pushToken, platform } = req.body;
    await notificationService.registerPushToken(req.user.id, deviceId, pushToken, platform);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/users/push-token — removes this device's push registration (user turned notifications off). */
export async function unregisterPushToken(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    await notificationService.unregisterPushToken(req.user.id, req.body.deviceId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function enrollResident(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const resident = await residentService.enrollResident(req.body, req.user);
    res.status(201).json({ data: resident });
  } catch (err) {
    next(err);
  }
}

export async function listGuardians(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const guardians = await residentService.listGuardians(req.user);
    res.status(200).json({ data: await attachPhotoUrls(guardians) });
  } catch (err) {
    next(err);
  }
}

export async function registerGuardian(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const guardian = await residentService.registerGuardianWithWards(req.body, req.user);
    res.status(201).json({ data: guardian });
  } catch (err) {
    next(err);
  }
}

export async function listResponders(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const responders = await residentService.listResponders(req.user);
    res.status(200).json({ data: await attachPhotoUrls(responders) });
  } catch (err) {
    next(err);
  }
}

export async function listResidents(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const residents = await residentService.listResidents(req.user);
    res.status(200).json({ data: await attachPhotoUrls(residents) });
  } catch (err) {
    next(err);
  }
}

export async function getResident(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const resident = await residentService.getResidentProfile(req.params.residentId, req.user);
    res.status(200).json({ data: await attachPhotoUrl(resident) });
  } catch (err) {
    next(err);
  }
}

export async function updateResident(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const resident = await residentService.updateResidentProfile(req.params.residentId, req.body, req.user);
    res.status(200).json({ data: await attachPhotoUrl(resident) });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT  /api/users/profile/photo, /accounts/:userId/photo, /residents/:residentId/photo
 * DELETE the same paths to remove the photo.
 */
export async function setMyPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    res.status(200).json({ data: await setUserPhoto(req.user.id, req.method === "DELETE" ? null : req.body.image, req.user) });
  } catch (err) {
    next(err);
  }
}

export async function setAccountPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    res.status(200).json({ data: await setUserPhoto(req.params.userId, req.method === "DELETE" ? null : req.body.image, req.user) });
  } catch (err) {
    next(err);
  }
}

export async function setResidentPhotoHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    res.status(200).json({ data: await setResidentPhoto(req.params.residentId, req.method === "DELETE" ? null : req.body.image, req.user) });
  } catch (err) {
    next(err);
  }
}
