import { EventEmitter } from "node:events";

/**
 * A small in-process event bus. Services publish domain events here;
 * src/sockets/index.ts subscribes and fans them out over Socket.io /
 * Supabase Realtime channels. Keeps business logic free of any
 * transport-layer (WebSocket) concerns.
 */
export const realtimeBus = new EventEmitter();

export const RealtimeEvents = {
  ACCOUNT_ACCESS_CHANGED: "account.access_changed",
  INCIDENT_CREATED: "incident.created", // [7]/[8B] display active alert on command console
  INCIDENT_ASSIGNED: "incident.assigned", // [8C]/[12] assigned emergency task
  INCIDENT_CONFIRMATION: "incident.confirmation", // [9A]/[9B]
  INCIDENT_STATUS_CHANGED: "incident.status_changed", // [10]
  INCIDENT_ESCALATED: "incident.escalated", // timeout engine
  INCIDENT_RESOLVED: "incident.resolved", // [14]
  INCIDENT_LOCATION_UPDATED: "incident.location_updated", // bystander live location
} as const;
