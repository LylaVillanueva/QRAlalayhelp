import type { Request, Response, NextFunction } from "express";
import * as qrService from "@/services/qr.service";
import * as incidentService from "@/services/incident.service";
import { AppError } from "@/utils/errors";

/** POST /api/qr/generate — [3] Real-Time Generated QR Code & Printing Token. */
export async function generateQr(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const result = await qrService.generateQrForResident(req.body.residentId, req.user);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/qr/:token/public-view — public, anonymous, sanitized.
 * Backs the "Anonymized Emergency Landing Page" ([9] in the context diagram).
 */
export async function getPublicView(req: Request, res: Response, next: NextFunction) {
  try {
    const view = await qrService.getPublicQrView(req.params.token);
    res.status(200).json({ data: view });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/qr/:token/scan-event — [6]/[7]/[8] scan -> alert creation.
 * Public endpoint; identity of the bystander is intentionally never
 * captured (silent, anonymous initialization per the DFD).
 */
export async function recordScanEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const incident = await incidentService.createIncidentFromScan({
      qrToken: req.params.token,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      bystanderNotes: req.body.bystanderNotes,
    });
    res.status(201).json({
      data: publicScanResultView(incident),
    });
  } catch (err) {
    next(err);
  }
}

/** Allowlisted result for the requester; internal incident IDs stay server-side. */
export function publicScanResultView(incident: {
  status: string;
  cancel_token?: string | null;
  cancellable_until?: Date | string | null;
  location_share_token?: string | null;
}) {
  return {
    status: incident.status,
    // Only present while this exact alert can still be retracted — see POST /api/qr/cancel.
    cancelToken: incident.cancel_token ?? null,
    cancellableUntil: incident.cancellable_until ?? null,
    // Lets this scanner keep sharing their location — see POST /api/qr/location.
    locationShareToken: incident.location_share_token ?? null,
  };
}

/**
 * POST /api/qr/cancel — public. Same trust model as the scan itself:
 * possession of the cancel token issued in the scan-event response is
 * what authorizes retracting it, since a bystander has no account.
 */
export async function cancelScan(req: Request, res: Response, next: NextFunction) {
  try {
    const cancelled = await incidentService.cancelIncidentFromScan(req.body.cancelToken);
    res.status(200).json({ data: { cancelled } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/qr/location — public; authorized by the scanner's share token. */
export async function shareLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await incidentService.updateSharedLocation(req.body.shareToken, req.body.latitude, req.body.longitude);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/** POST /api/qr/location/stop — public; the bystander stops sharing. */
export async function stopLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await incidentService.stopSharedLocation(req.body.shareToken);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function revokeQr(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const result = await qrService.revokeQrToken(req.params.token, req.user);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
