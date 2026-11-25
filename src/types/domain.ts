export type UserRole = "guardian" | "barangay_official" | "barangay_responder";

export type AuthChannel = "phone" | "email";

export type IncidentStatus =
  | "active"
  | "confirmed_safe"
  | "confirmed_not_safe"
  | "escalated"
  | "assigned"
  | "resolved"
  | "closed";

export type ConfirmationDecision = "safe" | "not_safe";
export type ConfirmationSource = "guardian" | "barangay_responder";

export interface AuthUser {
  id: string;
  role: UserRole;
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  barangayId: string | null;
  barangayName: string | null;
}

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
  barangayId: string | null;
  deviceId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  deviceId: string;
  tokenId: string; // refresh_tokens.id — allows server-side revocation lookup
  type: "refresh";
}

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      deviceId?: string;
    }
  }
}

export {};
