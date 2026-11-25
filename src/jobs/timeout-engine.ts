import {
  escalateTimedOutIncidents,
  sendConfirmationReminders,
  autoMarkUnreachableGuardiansAfterGracePeriod,
} from "@/services/incident.service";
import { logger } from "@/utils/logger";

const POLL_INTERVAL_MS = 30_000;

/**
 * "Automated Timeout Engine" from the DFD: periodically nudges whoever
 * hasn't confirmed yet, escalates any alert that's blown past its timeout
 * with no confirmation, and — once an escalated alert has sat with the
 * responder saying Safe and the guardian still silent well past that —
 * attests the guardian unreachable so an official can review and close it.
 * Runs in-process on a simple interval — for multi-instance deployments,
 * move this to a single scheduled worker (e.g. a cron-triggered Supabase
 * Edge Function or a dedicated worker dyno) to avoid duplicate runs.
 */
export function startTimeoutEngine() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const reminded = await sendConfirmationReminders();
      if (reminded > 0) logger.info({ reminded }, "timeout_engine.sent_reminders");
      const escalated = await escalateTimedOutIncidents();
      if (escalated > 0) logger.info({ count: escalated }, "timeout_engine.escalated_incidents");
      const autoMarked = await autoMarkUnreachableGuardiansAfterGracePeriod();
      if (autoMarked > 0) logger.info({ count: autoMarked }, "timeout_engine.auto_marked_guardian_unreachable");
    } catch (err) {
      logger.error({ err }, "timeout_engine.error");
    } finally {
      running = false;
    }
  }, POLL_INTERVAL_MS);

  timer.unref(); // don't keep the process alive solely for this timer
  return timer;
}
