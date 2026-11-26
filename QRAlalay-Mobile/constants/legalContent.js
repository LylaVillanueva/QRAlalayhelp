// Confirmed project identity. Legal review and personal information controller
// designation remain pending with the capstone adviser.
export const PROJECT_IDENTITY = Object.freeze({
  projectName: 'QRAlalay',
  developer: 'QRAlalay Student Research Team',
  academicInstitution: 'Technological University of the Philippines (TUP)',
  studyLocation: 'Barangay 206, Tondo, Manila, Philippines',
  projectClassification: 'Undergraduate Capstone Project',
  systemClassification: 'Capstone System Prototype',
  supportPrivacyEmail: 'qralalayhelp@gmail.com',
  officialWebsite: 'https://www.qralalay.app',
  tagline: 'Teknolohiya na may malasakit.',
  purpose: 'Community assistance and resident reunification',
});

export const EFFECTIVE_DATE = 'Draft — pending capstone adviser review';
export const PRIVACY_CONTACT_EMAIL = PROJECT_IDENTITY.supportPrivacyEmail;

export const PRIVACY_POLICY = [
  {
    heading: 'Who this covers',
    body:
      `QRAlalay is a ${PROJECT_IDENTITY.systemClassification} developed by ${PROJECT_IDENTITY.developer} as an ${PROJECT_IDENTITY.projectClassification} at ${PROJECT_IDENTITY.academicInstitution}. The study location is ${PROJECT_IDENTITY.studyLocation}. ` +
      'Naming the institution and study location does not mean that TUP or Barangay 206 officially operates, endorses, or owns QRAlalay. The designated personal information controller remains subject to confirmation with the capstone adviser. This policy covers barangay officials, ' +
      'guardians, barangay responders, and members of the public who scan a resident’s QR code. Accounts are provisioned by ' +
      'barangay staff — there is no public sign-up.',
  },
  {
    heading: 'What we collect',
    body:
      'Account holders: full name, phone number or email (used as a login identifier), and role. ' +
      'Residents (entered by barangay staff): full name, birth date, home address, medical notes, and whether the ' +
      'resident is a senior citizen or person with disability — this last category is treated as sensitive personal ' +
      'information under the Data Privacy Act and is only entered by barangay staff, never by the public. Guardian records ' +
      'also include guardian relationship and contact details. Public scans show only the card status, issuing barangay, and information the barangay has approved for public disclosure, plus confirmed barangay contact numbers. ' +
      'When someone requests assistance, the request may include a note, landmark, and device location if the scanner chooses to share it. The service also processes technical request data to prevent abuse and keep an audit trail.',
  },
  {
    heading: 'How it’s used',
    body:
      'Solely to run the emergency-alert workflow: notifying a resident’s guardian and barangay staff when a QR code is ' +
      'used to submit an emergency alert, coordinating a responder, and keeping an audit trail of that response. We do not use this data for ' +
      'advertising, and we do not sell it.',
  },
  {
    heading: 'Who we share it with',
    body:
      'The backend uses Supabase authentication, database, private photo storage, and server functions. The current mobile sign-in screen requests an email verification code; delivery depends on the configured Supabase Auth email provider. Phone sign-in is not currently enabled in the mobile interface. Profile photos are stored privately and displayed through time-limited links. The app can register a device for push notifications, but delivery depends on notification configuration, permissions, network access, and the barangay service. QR cards can be issued and securely re-exported when the required backend functions are deployed. Opening a map sends the selected coordinates to the external map service.',
  },
  {
    heading: 'What an anonymous scanner sees',
    body:
      'A public QR response shows whether the card is active, the issuing barangay, confirmed barangay contact numbers, and the resident display name or assistance instructions only when the barangay has approved public disclosure. It does not return the resident’s home address, medical notes, guardian contact details, or full record. Anyone with an active QR card can view this limited response.',
  },
  {
    heading: 'How long we keep it',
    body:
      'Account and resident records are kept for as long as the account is active with the barangay. Incident and scan ' +
      'history is kept as part of the barangay’s response record. We are working on formal retention limits for older ' +
      'records; this section will be updated once those are in place.',
  },
  {
    heading: 'Your rights',
    body:
      'For privacy questions or requests concerning personal information, contact the QRAlalay Student Research Team. Because resident records are entered and managed by barangay staff, a guardian or resident may also raise a correction request with their barangay office. The designated personal information controller is pending confirmation with the capstone adviser.',
    email: PRIVACY_CONTACT_EMAIL,
  },
  {
    heading: 'Security',
    body:
      'The mobile sign-in flow uses Supabase Auth email verification codes and then checks that the account has an active QRAlalay profile. Do not share verification codes. Access to resident data is restricted by account role and barangay authorization; guardian relationships require verification and responders receive scoped case access.',
  },
];

export const TERMS_OF_SERVICE = [
  {
    heading: 'Accounts',
    body:
      'QRAlalay accounts are created by barangay staff for verified officials, guardians, and responders. You’re ' +
      'responsible for keeping the device you sign in with secure, and for the accuracy of information you submit through ' +
      'your account.',
  },
  {
    heading: 'Not a replacement for emergency services',
    body:
      'QRAlalay helps coordinate a barangay-level response. It is not a substitute for calling 911 or your local emergency ' +
      'hotline directly, and alert delivery depends on network connectivity, device settings, and notification permissions ' +
      '— in a life-threatening situation, always contact emergency services first.',
  },
  {
    heading: 'Acceptable use',
    body:
      'Use the app only for its intended purpose: enrolling and monitoring residents, and responding to genuine QR-code ' +
      'scans. Submitting false alerts, or accessing resident data outside your role’s responsibilities, may result in your ' +
      'account being deactivated by your barangay office.',
  },
  {
    heading: 'Service availability',
    body:
      'We aim to keep the app available, but it may be interrupted for maintenance or by factors outside our control ' +
      '(network outages, third-party service downtime). We’ll work to restore service as quickly as possible.',
  },
  {
    heading: 'Changes to these terms',
    body:
      'If these terms change in a way that affects how your data is used, we’ll update this screen and the effective ' +
      'date below.',
  },
  {
    heading: 'Contact',
    body: 'For support or questions about these terms, contact:',
    email: PRIVACY_CONTACT_EMAIL,
  },
];

export const ABOUT_QRALALAY = [
  {
    heading: 'Purpose',
    body: `${PROJECT_IDENTITY.projectName} supports ${PROJECT_IDENTITY.purpose.toLowerCase()}.`,
  },
  {
    heading: 'Project identity',
    body: `${PROJECT_IDENTITY.systemClassification}, developed by ${PROJECT_IDENTITY.developer} as an ${PROJECT_IDENTITY.projectClassification} at ${PROJECT_IDENTITY.academicInstitution}.`,
  },
  {
    heading: 'Designed for the community',
    body:
      `The study location is ${PROJECT_IDENTITY.studyLocation}. QR technology facilitates coordinated assistance among community members, guardians, barangay officials, and responders. Naming TUP and Barangay 206 describes the academic and study context only; it does not claim that either officially operates, endorses, or owns QRAlalay.`,
  },
  {
    heading: 'Inspired by bayanihan',
    body:
      'Inspired by the Filipino spirit of bayanihan, QRAlalay aims to promote accessible, technology-assisted community care.',
  },
  {
    heading: 'System prototype',
    body:
      `${PROJECT_IDENTITY.systemClassification}. It is not an official emergency dispatch service or a substitute for professional emergency assistance.`,
  },
  {
    heading: 'Tagline',
    body: PROJECT_IDENTITY.tagline,
  },
  {
    heading: 'Inquiries',
    body: 'For support and privacy inquiries, contact:',
    email: PRIVACY_CONTACT_EMAIL,
    website: PROJECT_IDENTITY.officialWebsite,
  },
];
