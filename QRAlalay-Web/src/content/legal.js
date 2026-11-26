// Public project information and policy descriptions for the current prototype.
// The personal information controller designation and final policy review remain
// subject to confirmation with the capstone adviser.
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
  purpose: 'community assistance and resident reunification',
});

export const EFFECTIVE_DATE = 'Draft — pending capstone adviser review';
const CONTACT = PROJECT_IDENTITY.supportPrivacyEmail;

export const LEGAL_PAGES = {
  about: {
    title: 'About QRAlalay',
    sections: [
      {
        heading: 'Purpose',
        body: `${PROJECT_IDENTITY.projectName} supports ${PROJECT_IDENTITY.purpose}.`,
      },
      {
        heading: 'Project identity',
        body: `${PROJECT_IDENTITY.systemClassification}, developed by ${PROJECT_IDENTITY.developer} as an ${PROJECT_IDENTITY.projectClassification} at ${PROJECT_IDENTITY.academicInstitution}.`,
      },
      {
        heading: 'Study context',
        body: `The study location is ${PROJECT_IDENTITY.studyLocation}. QR technology facilitates coordinated assistance among community members, guardians, barangay officials, and responders. This academic and study context does not mean TUP or Barangay 206 officially operates, endorses, or owns QRAlalay.`,
      },
      {
        heading: 'Inspired by bayanihan',
        body: 'Inspired by the Filipino spirit of bayanihan, QRAlalay aims to promote accessible, technology-assisted community care.',
      },
      {
        heading: 'Capstone System Prototype',
        body: 'QRAlalay is a Capstone System Prototype. It is not an official emergency dispatch service or a substitute for professional emergency assistance.',
      },
      {
        heading: 'Tagline',
        body: PROJECT_IDENTITY.tagline,
      },
      {
        heading: 'Inquiries',
        body: 'For support and privacy inquiries, contact:',
        email: CONTACT,
        website: PROJECT_IDENTITY.officialWebsite,
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Project and policy status',
        body: `${PROJECT_IDENTITY.projectName} is a ${PROJECT_IDENTITY.systemClassification} developed by ${PROJECT_IDENTITY.developer} as an ${PROJECT_IDENTITY.projectClassification} at ${PROJECT_IDENTITY.academicInstitution}. The study location is ${PROJECT_IDENTITY.studyLocation}. Neither TUP nor Barangay 206 is represented as operating, endorsing, or owning the project. The designated personal information controller remains subject to confirmation with the capstone adviser; this draft does not assign that designation.`,
      },
      {
        heading: 'What a scanned card shows',
        body: 'Scanning a card shows whether the card is active and which barangay issued it. A resident’s display name or assistance instructions appear only if the barangay has approved showing them. The site does not show a resident’s home address, medical information, or a guardian’s phone number. It shows only barangay contact numbers that have been confirmed for display.',
      },
      {
        heading: 'What we collect when you request assistance',
        body: 'The note and landmark you type; your device’s location, once, only if you choose to share it and your browser allows it; the time of the request; and a protected (hashed) form of your network address used to limit misuse. You do not create an account and the form does not ask for your name.',
      },
      {
        heading: 'Who can see it',
        body: 'Access is restricted by the backend to authorized accounts and the responder assigned to a request, according to their role and the system’s authorization rules. Information is not used for advertising or sold.',
      },
      {
        heading: 'Your browser',
        body: 'This site stores random request codes in your browser’s session storage so a retried request is not sent twice and so you can cancel or check your own request. It also remembers your language choice. It uses no advertising or analytics trackers, and its fonts are served from this site.',
      },
      {
        heading: 'Retention',
        body: 'Assistance requests are retained in the system’s records. Formal retention periods remain under review and will be updated after confirmation with the capstone adviser and relevant stakeholders.',
      },
      {
        heading: 'Privacy inquiries and requests',
        body: 'For questions or requests concerning personal information, contact the QRAlalay Student Research Team. The person or organization designated as personal information controller has not yet been confirmed with the capstone adviser.',
        email: CONTACT,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Prototype service',
        body: 'QRAlalay is a Capstone System Prototype for community assistance and resident reunification. It is not an official emergency dispatch service or a substitute for professional emergency assistance.',
      },
      {
        heading: 'Use for genuine assistance only',
        body: 'Use a QRAlalay card only to request help for the resident who carries it. False or prank requests can divert attention from people who need help.',
      },
      {
        heading: 'Emergency services',
        body: 'Sending a request does not guarantee that help will arrive or say when it will arrive. Delivery depends on network connections and service availability. If anyone is in immediate danger, contact professional emergency services directly.',
      },
      {
        heading: 'Accuracy and privacy',
        body: 'Describe only what you see. Do not include your own or the resident’s sensitive personal details in a public assistance note.',
      },
      {
        heading: 'Availability and changes',
        body: 'The prototype may be interrupted for maintenance or by outages outside the project team’s control. If these terms change, this page and its review date will be updated.',
      },
      {
        heading: 'Contact',
        body: 'For support or questions about these terms, contact:',
        email: CONTACT,
      },
    ],
  },
};
