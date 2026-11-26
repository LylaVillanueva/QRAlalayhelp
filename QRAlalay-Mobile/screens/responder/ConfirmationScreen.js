import React from 'react';
import SharedConfirmationScreen from "../shared/ConfirmationScreen";

const NOT_SAFE_BULLETS = [
  'This records what you observed: the resident still needs help.',
  'The barangay official sees it on the request and cannot close the case while it stands.',
  'If the situation improves, you can report Safe later.',
];

export default function ConfirmationScreen(props) {
  return <SharedConfirmationScreen {...props} role="responder" notSafeBullets={NOT_SAFE_BULLETS} />;
}
