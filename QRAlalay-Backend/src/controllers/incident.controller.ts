import type { Request, Response, NextFunction } from "express";
import * as incidentService from "@/services/incident.service";
import { AppError } from "@/utils/errors";
import { attachPhotoUrls } from "@/services/photo.service";

const ALERT_PHOTOS = [
  { pathKey: "resident_photo_path", urlKey: "resident_photo_url" },
  { pathKey: "assigned_responder_photo_path", urlKey: "assigned_responder_photo_url" },
];

// Cancellation is reserved for the public session that created the alert.
export function incidentView(incident: Record<string, unknown>) {
  const { cancel_token, ...view } = incident;
  return view;
}

/** POST /api/incidents/create — authenticated direct trigger (e.g. guardian SOS from the app). */
export async function createDirect(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.createIncidentDirect(req.body, req.user);
    res.status(201).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/incidents/active — [8B] Display Active Alert on Command Console. */
export async function listActive(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const includeClosed = req.query.status === "all";
    const incidents = await incidentService.listActiveIncidents(req.user, { includeClosed });
    res.status(200).json({ data: await attachPhotoUrls(incidents.map(incidentView), ALERT_PHOTOS) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/incidents/resident/:residentId — full history for one resident's profile. */
export async function listForResident(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incidents = await incidentService.listIncidentHistoryForResident(req.params.residentId, req.user);
    res.status(200).json({ data: incidents.map(incidentView) });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.getIncidentById(req.params.incidentId, req.user);
    const [view] = await attachPhotoUrls([incidentView(incident)], ALERT_PHOTOS);
    res.status(200).json({ data: view });
  } catch (err) {
    next(err);
  }
}

/** POST /api/incidents/:incidentId/confirmation — [9A]/[9B]. */
export async function submitConfirmation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.submitConfirmation(req.params.incidentId, req.user, req.body.decision, req.body.summaryNotes);
    res.status(200).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/incidents/:incidentId/assign — [8C]/[12]. */
export async function assignResponder(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.assignResponder(req.params.incidentId, req.body.responderId, req.user);
    res.status(200).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/incidents/:incidentId/resolve — [14]. */
export async function resolve(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.resolveIncident(req.params.incidentId, req.user, req.body.finalActionSummary);
    res.status(200).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/incidents/:incidentId/close — [10]. */
export async function close(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.closeIncident(req.params.incidentId, req.user);
    res.status(200).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/incidents/:incidentId/guardian-unreachable — official or the assigned responder attests the guardian can't be reached. */
export async function markGuardianUnreachable(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.markGuardianUnreachable(req.params.incidentId, req.user, req.body.reason);
    res.status(200).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}

/** POST /api/incidents/:incidentId/responder-unreachable — the assigned responder can't physically reach the resident. */
export async function markResponderUnreachableLocation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw AppError.unauthorized();
    const incident = await incidentService.markResponderUnreachableLocation(req.params.incidentId, req.user, req.body.reason);
    res.status(200).json({ data: incidentView(incident) });
  } catch (err) {
    next(err);
  }
}
