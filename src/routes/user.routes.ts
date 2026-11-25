import * as accountController from '@/controllers/account.controller';
import { createAccountSchema, updateAccountSchema, changeRoleSchema, accountStatusSchema, accountIdSchema } from '@/routes/schemas/account.schema';
import { Router } from "express";
import * as userController from "@/controllers/user.controller";
import { requireAuth } from "@/middlewares/auth";
import { requireRole } from "@/middlewares/rbac";
import { validate } from "@/middlewares/validate";
import { enrollResidentSchema, updateResidentSchema, residentIdParamSchema, registerGuardianSchema, photoUploadSchema } from "@/routes/schemas/resident.schema";
import { registerPushTokenSchema, unregisterPushTokenSchema } from "@/routes/schemas/notification.schema";
import { barangayContactIdSchema, contactVerificationSchema, saveBarangayContactSchema } from "@/routes/schemas/barangay-contact.schema";

const router = Router();

router.use(requireAuth);

// Account holder's own profile (guardian / barangay_official / barangay_responder).
router.get("/profile", userController.getMyProfile);
router.get("/barangay-contacts", userController.listBarangayContacts);
router.put("/barangay-contacts", requireRole("barangay_official"), validate({ body: saveBarangayContactSchema }), userController.saveBarangayContact);
router.post("/barangay-contacts/:contactId/verification", requireRole("barangay_official"), validate({ params: barangayContactIdSchema, body: contactVerificationSchema }), userController.verifyBarangayContact);
router.put("/profile/photo", validate({ body: photoUploadSchema }), userController.setMyPhoto);
router.delete("/profile/photo", userController.setMyPhoto);
router.post("/push-token", validate({ body: registerPushTokenSchema }), userController.registerPushToken);
router.delete("/push-token", validate({ body: unregisterPushTokenSchema }), userController.unregisterPushToken);

router.get('/accounts', requireRole('barangay_official'), accountController.list);
router.post('/accounts', requireRole('barangay_official'), validate({ body: createAccountSchema }), accountController.create);
router.patch('/accounts/:userId', requireRole('barangay_official'), validate({ params: accountIdSchema, body: updateAccountSchema }), accountController.update);
router.patch('/accounts/:userId/role', requireRole('barangay_official'), validate({ params: accountIdSchema, body: changeRoleSchema }), accountController.changeRole);
router.patch('/accounts/:userId/status', requireRole('barangay_official'), validate({ params: accountIdSchema, body: accountStatusSchema }), accountController.setActive);
router.put('/accounts/:userId/photo', requireRole('barangay_official'), validate({ params: accountIdSchema, body: photoUploadSchema }), userController.setAccountPhoto);
router.delete('/accounts/:userId/photo', requireRole('barangay_official'), validate({ params: accountIdSchema }), userController.setAccountPhoto);

// Resident (ward) enrolment & medical profile management.
// [2] Resident Enrolment Profile Data — barangay officials only.
router.post("/residents", requireRole("barangay_official"), validate({ body: enrollResidentSchema }), userController.enrollResident);

// Officials get everyone in their barangay; guardians get only their own
// wards; responders get only residents from incidents assigned to them.
router.get("/residents", requireRole("barangay_official", "barangay_responder", "guardian"), userController.listResidents);
router.get("/guardians", requireRole("barangay_official"), userController.listGuardians);
router.post("/guardians", requireRole("barangay_official"), validate({ body: registerGuardianSchema }), userController.registerGuardian);
router.get("/responders", requireRole("barangay_official"), userController.listResponders);

router.get("/residents/:residentId", validate({ params: residentIdParamSchema }), userController.getResident);

router.put(
  "/residents/:residentId",
  requireRole("guardian", "barangay_official"),
  validate({ params: residentIdParamSchema, body: updateResidentSchema }),
  userController.updateResident
);

// Officials (same barangay) and the resident's own guardian can set or remove the photo.
router.put(
  "/residents/:residentId/photo",
  requireRole("guardian", "barangay_official"),
  validate({ params: residentIdParamSchema, body: photoUploadSchema }),
  userController.setResidentPhotoHandler
);
router.delete(
  "/residents/:residentId/photo",
  requireRole("guardian", "barangay_official"),
  validate({ params: residentIdParamSchema }),
  userController.setResidentPhotoHandler
);

export default router;
