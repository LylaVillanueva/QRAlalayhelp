export interface IncidentSafety {
  guardian_required: boolean;
  guardian_decision?: string | null;
  responder_decision?: string | null;
  assigned_responder_id?: string | null;
  report_submitted_by?: string | null;
  report_submitted_at?: unknown;
  final_action_summary?: string | null;
  guardian_unreachable_at?: unknown;
}

// True once someone (or the system, after the grace period) has recorded
// that the guardian's confirmation genuinely can't be obtained for this
// incident — treated the same as a resident who never had a guardian to
// begin with: the responder's word plus a written report stands in for it.
export function guardianWaived(i: IncidentSafety) {
  return i.guardian_required === false || !!i.guardian_unreachable_at;
}

export function hasDiscrepancy(i: Pick<IncidentSafety, "guardian_decision" | "responder_decision">) {
  return !!i.guardian_decision && !!i.responder_decision && i.guardian_decision !== i.responder_decision;
}

export function safetyConfirmed(i: IncidentSafety) {
  return !!i.assigned_responder_id && i.responder_decision === "safe"
    && i.guardian_decision !== "not_safe"
    && (guardianWaived(i) || i.guardian_decision === "safe");
}

export function canCloseIncident(i: IncidentSafety) {
  return safetyConfirmed(i) && (!guardianWaived(i) || (
    i.report_submitted_by === i.assigned_responder_id && !!i.report_submitted_at
    && !!i.final_action_summary?.trim()
  ));
}
