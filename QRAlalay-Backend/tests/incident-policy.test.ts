import test from 'node:test';
import assert from 'node:assert/strict';
import { canCloseIncident, safetyConfirmed } from '../src/services/incident-policy';

const noGuardian = { guardian_required: false, assigned_responder_id: 'responder', responder_decision: 'safe' };
const report = { report_submitted_by: 'responder', report_submitted_at: new Date(), final_action_summary: 'Resident assessed on site and safe.' };
test('no guardian: Safe alone cannot close; current responder report is required', () => {
  assert.equal(canCloseIncident(noGuardian), false);
  assert.equal(canCloseIncident({ ...noGuardian, ...report }), true);
});
test('a pending guardian still requires confirmation until explicitly marked unreachable', () => {
  assert.equal(canCloseIncident({ ...noGuardian, ...report, guardian_required: true }), false);
  assert.equal(canCloseIncident({ ...noGuardian, guardian_required: true, guardian_decision: 'safe' }), true);
});
test('a recorded unreachable guardian requires the current responder report and no Not Safe concern', () => {
  const incident = { ...noGuardian, guardian_required: true, guardian_unreachable_at: new Date() };
  assert.equal(canCloseIncident(incident), false);
  assert.equal(canCloseIncident({ ...incident, ...report }), true);
  assert.equal(canCloseIncident({ ...incident, ...report, guardian_decision: 'not_safe' }), false);
});
test('either Not Safe decision blocks closure, including after a report', () => {
  for (const guardian_required of [true, false]) {
    assert.equal(canCloseIncident({ ...noGuardian, ...report, guardian_required, guardian_decision: 'not_safe' }), false);
    assert.equal(canCloseIncident({ ...noGuardian, ...report, guardian_required, guardian_decision: 'safe', responder_decision: 'not_safe' }), false);
  }
});
test('unassigned responder and stale or blank reports cannot satisfy closure', () => {
  assert.equal(safetyConfirmed({ ...noGuardian, assigned_responder_id: null }), false);
  assert.equal(canCloseIncident({ ...noGuardian, ...report, assigned_responder_id: 'new-responder' }), false);
  assert.equal(canCloseIncident({ ...noGuardian, ...report, report_submitted_at: null }), false);
  assert.equal(canCloseIncident({ ...noGuardian, ...report, final_action_summary: '  ' }), false);
});
