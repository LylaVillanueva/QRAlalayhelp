// Public website policy text. It describes what the public QR pages actually do
// (see services/api.js and the Supabase public Edge Functions). The bracketed
// values must be filled in and the text reviewed by the barangay's data
// protection officer before the site is publicised. Update EFFECTIVE_DATE
// whenever the text changes.
export const EFFECTIVE_DATE = 'Draft — pending barangay review';
const OPERATOR = '[Barangay / Organization Name]';
const PRIVACY_CONTACT = '[privacy contact email]';

export const LEGAL_PAGES = {
  about: {
    title: 'About QRAlalay',
    sections: [
      {
        heading: 'Teknolohiya na may malasakit',
        body: 'QRAlalay is a barangay community assistance and reunification system. Older adults and persons with disability who are registered by their barangay receive a QRAlalay card. If a resident needs help, anyone nearby can scan the card to send an assistance request to the barangay.',
      },
      {
        heading: 'Who takes part',
        body: 'Barangay officials register residents, issue cards, review requests and close cases. Barangay responders accept assignments and report what they observed and did. Verified guardians are told when their resident needs help. Members of the public scan cards and request assistance, with no account needed.',
      },
      {
        heading: 'What QRAlalay is not',
        body: 'QRAlalay is not an emergency dispatch service. It does not contact ambulances, police or fire services, and it cannot promise when or whether a responder will arrive. In any situation that threatens life or safety, call 911.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Who runs this site',
        body: `This site is operated for ${OPERATOR} as part of QRAlalay. It is used by members of the public who scan a resident’s QRAlalay card.`,
      },
      {
        heading: 'What a scanned card shows',
        body: 'Scanning a card shows whether the card is active and which barangay issued it. A resident’s display name or assistance instructions appear only if the barangay has formally approved showing them. The site never shows a resident’s home address, medical information, or a guardian’s phone number. It shows only barangay contact numbers that the barangay has confirmed.',
      },
      {
        heading: 'What we collect when you request assistance',
        body: 'The note and landmark you type; your device’s location, once, only if you choose to share it and your browser allows it; the time of the request; and a protected (hashed) form of your network address used only to limit misuse. You do not create an account and we do not ask for your name.',
      },
      {
        heading: 'Who can see it',
        body: 'Barangay officials of the resident’s barangay, the responder assigned to the request, and the resident’s verified guardian. It is not used for advertising and is not sold.',
      },
      {
        heading: 'Your browser',
        body: 'This site stores a few random request codes in your browser’s session storage, so that a retried request is not sent twice and so that you can cancel or check your own request. It also remembers your language choice. It uses no advertising or analytics trackers, and its fonts are served from this site.',
      },
      {
        heading: 'How long it is kept',
        body: 'Requests are kept as part of the barangay’s assistance record. Formal retention periods are being set by the barangay and will be published here.',
      },
      {
        heading: 'Your rights',
        body: `Under the Data Privacy Act of 2012 (RA 10173) you may ask to access, correct or delete personal data about you. Contact ${PRIVACY_CONTACT} or your barangay office.`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Use for genuine assistance only',
        body: 'Use a QRAlalay card only to request help for the resident who carries it. False or prank requests take barangay attention away from people who need it and may be reported to the barangay.',
      },
      {
        heading: 'Not a replacement for emergency services',
        body: 'Sending a request does not guarantee that help will arrive or say when it will arrive. Delivery depends on network connections and barangay availability. If anyone is in immediate danger, call 911 first.',
      },
      {
        heading: 'Accuracy',
        body: 'Describe only what you see. Do not include your own or the resident’s sensitive personal details in the note.',
      },
      {
        heading: 'Availability and changes',
        body: 'The service may be interrupted for maintenance or by outages outside our control. If these terms change, this page and its date will be updated.',
      },
      {
        heading: 'Contact',
        body: `Questions about these terms can be sent to ${PRIVACY_CONTACT}.`,
      },
    ],
  },
};
