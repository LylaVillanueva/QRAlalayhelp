import { Router } from "express";
import * as incidentController from "@/controllers/incident.controller";
import { requireAuth } from "@/middlewares/auth";
import { requireRole } from "@/middlewares/rbac";
import { validate } from "@/middlewares/validate";
import {
  incidentIdParamSchema,
  residentIdParamSchema,
  createIncidentSchema,
  confirmationSchema,
  assignResponderSchema,
  resolveIncidentSchema,
  unreachableReasonSchema,
} from "@/routes/schemas/incident.schema";

const router = Router();

router.use(requireAuth);

router.post("/create", requireRole("guardian", "barangay_official", "barangay_responder"), validate({ body: createIncidentSchema }), incidentController.createDirect);

router.get("/active", incidentController.listActive);
router.get("/resident/:residentId", validate({ params: residentIdParamSchema }), incidentController.listForResident);
router.get("/:incidentId", validate({ params: incidentIdParamSchema }), incidentController.getOne);

// [9A]/[9B] Submits 'Safe'/'Not Safe' Decision & Summary Notes
router.post(
  "/:incidentId/confirmation",
  requireRole("guardian", "barangay_responder"),
  validate({ params: incidentIdParamSchema, body: confirmationSchema }),
  incidentController.submitConfirmation
);

// [8C]/[12] Assigns Task & Sends Coordinates
router.post(
  "/:incidentId/assign",
  requireRole("barangay_official"),
  validate({ params: incidentIdParamSchema, body: assignResponderSchema }),
  incidentController.assignResponder
);

// [14] Synchronous Safety Decision & Final Action Summary
router.post(
  "/:incidentId/resolve",
  requireRole("barangay_responder"),
  validate({ params: incidentIdParamSchema, body: resolveIncidentSchema }),
  incidentController.resolve
);

// [10] Updates Incident State (Closed)
router.post("/:incidentId/close", requireRole("barangay_official"), validate({ params: incidentIdParamSchema }), incidentController.close);

// Accountable alternatives to a silent timeout — see incident-policy.ts.
router.post(
  "/:incidentId/guardian-unreachable",
  requireRole("barangay_official", "barangay_responder"),
  validate({ params: incidentIdParamSchema, body: unreachableReasonSchema }),
  incidentController.markGuardianUnreachable
);
router.post(
  "/:incidentId/responder-unreachable",
  requireRole("barangay_responder"),
  validate({ params: incidentIdParamSchema, body: unreachableReasonSchema }),
  incidentController.markResponderUnreachableLocation
);

export default router;
