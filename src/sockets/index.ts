import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { env } from "@/config/env";
import { verifyAccessToken } from "@/services/token.service";
import { getUserById } from "@/services/auth.service";
import { realtimeBus, RealtimeEvents } from "@/services/realtime";
import { logger } from "@/utils/logger";
import { pool } from "@/db/pool";

/** Match the HTTP incident audience; never broadcast resident data globally. */
export async function publishIncident(io: Server, event: string, incident: Record<string, any>) {
  if (!incident?.resident_id) return;
  const { rows } = await pool.query('select barangay_id, guardian_id from residents where id = $1', [incident.resident_id]);
  const resident = rows[0];
  if (!resident) return;
  const rooms: string[] = [];
  if (resident.barangay_id) rooms.push(`barangay:${resident.barangay_id}`);
  if (resident.guardian_id) rooms.push(`guardian:${resident.guardian_id}`);
  if (!rooms.length) return;
  const { cancel_token, ...publicIncident } = incident;
  io.to(rooms).emit(event, publicIncident);
}

/**
 * Room convention:
 *   barangay:<barangayId>   -> officials + responders in that barangay
 *   guardian:<userId>       -> a specific guardian's own devices
 *   responder:<userId>      -> a specific responder's own devices
 *
 * This lets incident events fan out to exactly the audiences shown in
 * the context diagram ([8A] guardian push, [8B] command console,
 * [12] assigned responder) without per-event DB lookups on the socket
 * layer — the incident.service already resolves who needs to know.
 */
export function initSockets(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: [env.cors.webDashboardOrigin],
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.accessToken as string | undefined;
      if (!token) return next(new Error("Missing access token"));
      const payload = verifyAccessToken(token);
      const user = await getUserById(payload.sub);
      if (!user) return next(new Error("User not found"));
      if (payload.role !== user.role || payload.barangayId !== user.barangayId) return next(new Error('Account access changed'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.barangayId && (user.role === "barangay_official" || user.role === "barangay_responder")) {
      socket.join(`barangay:${user.barangayId}`);
    }
    if (user.role === "guardian") socket.join(`guardian:${user.id}`);
    if (user.role === "barangay_responder") socket.join(`responder:${user.id}`);

    logger.debug({ userId: user.id, role: user.role }, "socket.connected");
  });

  realtimeBus.on(RealtimeEvents.ACCOUNT_ACCESS_CHANGED, ({ userId }) => {
    io.in(`user:${userId}`).disconnectSockets(true);
  });

  const publish = (event: string, incident: Record<string, any>) => {
    void publishIncident(io, event, incident).catch(err => logger.error({ err }, 'socket.incident_publish_failed'));
  };

  realtimeBus.on(RealtimeEvents.INCIDENT_CREATED, ({ incident }) => publish('incident:created', incident));

  realtimeBus.on(RealtimeEvents.INCIDENT_ASSIGNED, ({ incident, responderId }) => {
    const { cancel_token, ...publicIncident } = incident;
    io.to(`responder:${responderId}`).emit("incident:assigned", publicIncident);
    publish('incident:updated', incident);
  });

  for (const event of [RealtimeEvents.INCIDENT_CONFIRMATION, RealtimeEvents.INCIDENT_STATUS_CHANGED, RealtimeEvents.INCIDENT_ESCALATED, RealtimeEvents.INCIDENT_RESOLVED, RealtimeEvents.INCIDENT_LOCATION_UPDATED]) {
    realtimeBus.on(event, ({ incident }) => {
      if (incident?.resident_id) {
        publish('incident:updated', incident);
      }
    });
  }

  return io;
}
