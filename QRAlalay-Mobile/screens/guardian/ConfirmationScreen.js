import React from 'react';
import SharedConfirmationScreen from "../shared/ConfirmationScreen";

const NOT_SAFE_BULLETS = [
  'This records your own observation that the resident may still need help.',
  'The barangay uses it when reviewing the request; it does not close the case.',
  'If the situation improves, you can report Safe later.',
];

export default function ConfirmationScreen(props) {
  return <SharedConfirmationScreen {...props} role="guardian" notSafeBullets={NOT_SAFE_BULLETS} />;
}
